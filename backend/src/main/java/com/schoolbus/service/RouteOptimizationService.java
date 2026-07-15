package com.schoolbus.service;

import com.schoolbus.model.Route;
import com.schoolbus.model.RouteOptimization;
import com.schoolbus.repository.RouteRepository;
import com.schoolbus.repository.RouteOptimizationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class RouteOptimizationService {

    @Autowired
    private RouteRepository routeRepository;

    @Autowired
    private RouteOptimizationRepository routeOptimizationRepository;

    private static final double SCHOOL_LAT = 37.4275;
    private static final double SCHOOL_LNG = -122.1697;

    public static class Coordinate {
        double lat;
        double lng;
        String name;
        int originalIndex;

        public Coordinate(double lat, double lng, String name, int originalIndex) {
            this.lat = lat;
            this.lng = lng;
            this.name = name;
            this.originalIndex = originalIndex;
        }
    }

    public List<RouteOptimization> getHistory() {
        return routeOptimizationRepository.findAll();
    }

    public RouteOptimization generateOptimization(Long routeId, String trafficLevel, String roadClosures, String weather) {
        Optional<Route> routeOpt = routeRepository.findById(routeId);
        if (routeOpt.isEmpty()) {
            throw new IllegalArgumentException("Route not found: " + routeId);
        }
        Route route = routeOpt.get();

        // 1. Gather stops and parse coordinates
        List<String> rawStops = route.getStops();
        if (rawStops == null || rawStops.isEmpty()) {
            rawStops = Arrays.asList("School", "Oak Street", "Maple Avenue", "Pine Road", "Cedar Lane");
        }

        List<Coordinate> coords = new ArrayList<>();
        // School is the hub (index 0)
        coords.add(new Coordinate(SCHOOL_LAT, SCHOOL_LNG, rawStops.get(0), 0));

        // Seed random coords for stops that don't have geo-coords parsed
        Random rand = new Random(routeId + 42); // deterministic seed based on route
        for (int i = 1; i < rawStops.size(); i++) {
            String stop = rawStops.get(i);
            Coordinate parsed = parseGeoCoordinate(stop, i);
            if (parsed == null) {
                // Generate a mock coordinate within ~5km of school
                double latOffset = (rand.nextDouble() - 0.5) * 0.04;
                double lngOffset = (rand.nextDouble() - 0.5) * 0.04;
                coords.add(new Coordinate(SCHOOL_LAT + latOffset, SCHOOL_LNG + lngOffset, stop, i));
            } else {
                coords.add(parsed);
            }
        }

        // 2. Solve TSP using 3 algorithms: Nearest Neighbor, Dijkstra heuristic, A* heuristic
        List<Coordinate> nnPath = solveNearestNeighbor(coords);
        List<Coordinate> dijkstraPath = solveDijkstraHeuristic(coords);
        List<Coordinate> aStarPath = solveAStarHeuristic(coords);

        // Pick the best path (minimum total distance)
        double nnDist = calculateTotalDistance(nnPath);
        double dijkstraDist = calculateTotalDistance(dijkstraPath);
        double aStarDist = calculateTotalDistance(aStarPath);

        List<Coordinate> bestPath = nnPath;
        double bestDist = nnDist;
        String bestAlgorithm = "Nearest Neighbor";

        if (dijkstraDist < bestDist) {
            bestDist = dijkstraDist;
            bestPath = dijkstraPath;
            bestAlgorithm = "Dijkstra";
        }
        if (aStarDist < bestDist) {
            bestDist = aStarDist;
            bestPath = aStarPath;
            bestAlgorithm = "A* Heuristic";
        }

        // 3. Compute metrics
        double trafficMultiplier = 1.0;
        if ("Moderate".equalsIgnoreCase(trafficLevel)) {
            trafficMultiplier = 1.25;
        } else if ("Heavy".equalsIgnoreCase(trafficLevel)) {
            trafficMultiplier = 1.6;
        }

        double weatherDelayMinutes = 0.0;
        if ("Rainy".equalsIgnoreCase(weather)) {
            weatherDelayMinutes = 5.0;
        } else if ("Stormy".equalsIgnoreCase(weather)) {
            weatherDelayMinutes = 15.0;
        }

        // Base speed 35 km/h
        double speedKmh = 35.0 / trafficMultiplier;
        double durationHours = bestDist / speedKmh;
        double durationMinutes = (durationHours * 60.0) + weatherDelayMinutes;

        // Fuel calculation (1 Liter per 4 km baseline)
        double fuelEfficiency = 4.0; // km/L
        
        // Assemble output lists
        List<String> suggestedRouteStops = new ArrayList<>();
        List<String> stopsOrderIndices = new ArrayList<>();
        for (Coordinate c : bestPath) {
            suggestedRouteStops.add(c.name);
            stopsOrderIndices.add(String.valueOf(c.originalIndex));
        }

        RouteOptimization opt = new RouteOptimization();
        opt.setRouteId(routeId);
        opt.setSchoolAddress(rawStops.get(0));
        opt.setStudentPickupLocations(String.join(", ", rawStops.subList(1, rawStops.size())));
        opt.setBusCapacity(40); // default
        opt.setNumberOfStudents(Math.max(1, rawStops.size() - 1));
        opt.setBusAssigned("BUS-" + (100 + routeId));
        opt.setTrafficLevel(trafficLevel);
        opt.setRoadClosures(roadClosures != null ? roadClosures : "None");
        opt.setSuggestedRoute(String.join(" -> ", suggestedRouteStops));
        opt.setStopsOrder(String.join(",", stopsOrderIndices));
        opt.setTotalDistance(Math.round(bestDist * 100.0) / 100.0);
        opt.setEstimatedTime(Math.round(durationMinutes * 10.0) / 10.0);
        opt.setFuelEfficiency(fuelEfficiency);
        opt.setBusUtilization(Math.round((opt.getNumberOfStudents() / 40.0) * 1000.0) / 10.0);
        opt.setAlgorithmUsed(bestAlgorithm);
        
        return routeOptimizationRepository.save(opt);
    }

    private Coordinate parseGeoCoordinate(String stop, int index) {
        // Look for pattern "name @ lat, lng"
        Pattern p = Pattern.compile("@\\s*(-?\\d+\\.\\d+)\\s*,\\s*(-?\\d+\\.\\d+)");
        Matcher m = p.matcher(stop);
        if (m.find()) {
            try {
                double lat = Double.parseDouble(m.group(1));
                double lng = Double.parseDouble(m.group(2));
                return new Coordinate(lat, lng, stop, index);
            } catch (Exception e) {
                // ignore
            }
        }
        return null;
    }

    private double getDistance(Coordinate c1, Coordinate c2) {
        // Haversine distance in km
        final int R = 6371; // Radious of the earth
        double latDistance = Math.toRadians(c2.lat - c1.lat);
        double lonDistance = Math.toRadians(c2.lng - c1.lng);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(c1.lat)) * Math.cos(Math.toRadians(c2.lat))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private double calculateTotalDistance(List<Coordinate> path) {
        double dist = 0.0;
        for (int i = 0; i < path.size() - 1; i++) {
            dist += getDistance(path.get(i), path.get(i + 1));
        }
        // Return back to start (school)
        if (path.size() > 1) {
            dist += getDistance(path.get(path.size() - 1), path.get(0));
        }
        return dist;
    }

    // Algorithm 1: Nearest Neighbor Heuristic
    private List<Coordinate> solveNearestNeighbor(List<Coordinate> coords) {
        List<Coordinate> path = new ArrayList<>();
        List<Coordinate> unvisited = new ArrayList<>(coords);
        
        // Start at School (index 0)
        Coordinate current = unvisited.remove(0);
        path.add(current);

        while (!unvisited.isEmpty()) {
            Coordinate nearest = null;
            double minDist = Double.MAX_VALUE;
            for (Coordinate u : unvisited) {
                double d = getDistance(current, u);
                if (d < minDist) {
                    minDist = d;
                    nearest = u;
                }
            }
            current = nearest;
            unvisited.remove(nearest);
            path.add(current);
        }
        return path;
    }

    // Algorithm 2: Dijkstra heuristic (Minimum spanning tree / Prim's step-based selection)
    private List<Coordinate> solveDijkstraHeuristic(List<Coordinate> coords) {
        // Complete graph traversal mimicking Dijkstra shortest path edges
        List<Coordinate> path = new ArrayList<>();
        boolean[] visited = new boolean[coords.size()];
        
        // Start from school (index 0)
        int currentIdx = 0;
        path.add(coords.get(0));
        visited[0] = true;

        for (int step = 1; step < coords.size(); step++) {
            double minCost = Double.MAX_VALUE;
            int nextIdx = -1;

            // Find closest unvisited node from ANY currently visited node (similar to Prim's MST / Dijkstra edge relaxation)
            for (int i = 0; i < coords.size(); i++) {
                if (visited[i]) {
                    for (int j = 0; j < coords.size(); j++) {
                        if (!visited[j]) {
                            double cost = getDistance(coords.get(i), coords.get(j));
                            if (cost < minCost) {
                                minCost = cost;
                                nextIdx = j;
                            }
                        }
                    }
                }
            }

            if (nextIdx != -1) {
                visited[nextIdx] = true;
                path.add(coords.get(nextIdx));
            }
        }
        return path;
    }

    // Algorithm 3: A* Heuristic
    private List<Coordinate> solveAStarHeuristic(List<Coordinate> coords) {
        // A* search using g(n) = distance from previous stop, h(n) = distance to school destination
        List<Coordinate> path = new ArrayList<>();
        List<Coordinate> unvisited = new ArrayList<>(coords);
        
        Coordinate school = unvisited.remove(0);
        path.add(school);
        Coordinate current = school;

        while (!unvisited.isEmpty()) {
            Coordinate nextNode = null;
            double minF = Double.MAX_VALUE;
            for (Coordinate u : unvisited) {
                double g = getDistance(current, u);
                double h = getDistance(u, school); // heuristic: distance back to school
                double f = g + h;
                if (f < minF) {
                    minF = f;
                    nextNode = u;
                }
            }
            current = nextNode;
            unvisited.remove(nextNode);
            path.add(current);
        }
        return path;
    }
}
