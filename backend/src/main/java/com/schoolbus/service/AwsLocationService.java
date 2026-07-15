package com.schoolbus.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.location.LocationClient;
import software.amazon.awssdk.services.location.model.CalculateRouteRequest;
import software.amazon.awssdk.services.location.model.CalculateRouteResponse;
import software.amazon.awssdk.services.location.model.SearchPlaceIndexForTextRequest;
import software.amazon.awssdk.services.location.model.SearchPlaceIndexForTextResponse;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;

@Service
public class AwsLocationService {

    @Value("${aws.access-key-id:}")
    private String accessKeyId;

    @Value("${aws.secret-access-key:}")
    private String secretAccessKey;

    @Value("${aws.region:ap-south-1}")
    private String region;

    @Value("${aws.location.place-index-name:schoolbus-place-index}")
    private String placeIndexName;

    @Value("${aws.location.route-calculator-name:schoolbus-route-calculator}")
    private String routeCalculatorName;

    @Value("${aws.location.default-city:Coimbatore, India}")
    private String defaultCity;

    private LocationClient locationClient;

    @PostConstruct
    public void init() {
        if (accessKeyId != null && !accessKeyId.trim().isEmpty() && 
            secretAccessKey != null && !secretAccessKey.trim().isEmpty()) {
            try {
                locationClient = LocationClient.builder()
                        .region(Region.of(region.trim()))
                        .credentialsProvider(StaticCredentialsProvider.create(
                                AwsBasicCredentials.create(accessKeyId.trim(), secretAccessKey.trim())
                        ))
                        .build();
                System.out.println("[AwsLocationService] Initialized AWS Location Client in region: " + region);
            } catch (Exception e) {
                System.err.println("[AwsLocationService] Failed to initialize Location Client: " + e.getMessage());
            }
        } else {
            System.out.println("[AwsLocationService] AWS Credentials not set. Location operations will be skipped or simulated.");
        }
    }

    public static class LocationEta {
        public double durationInTrafficSeconds;
        public double distanceMeters;

        public LocationEta(double durationInTrafficSeconds, double distanceMeters) {
            this.durationInTrafficSeconds = durationInTrafficSeconds;
            this.distanceMeters = distanceMeters;
        }
    }

    public static class LocationOptimization {
        public List<String> optimizedStops;
        public double optimizedDistance;

        public LocationOptimization(List<String> optimizedStops, double optimizedDistance) {
            this.optimizedStops = optimizedStops;
            this.optimizedDistance = optimizedDistance;
        }
    }

    /**
     * Resolves a text address to its [longitude, latitude] coordinates.
     */
    public List<Double> geocodeAddress(String address) {
        if (locationClient == null) {
            return null;
        }

        try {
            String searchText = address;
            if (defaultCity != null && !defaultCity.trim().isEmpty() && 
                !searchText.toLowerCase().contains(defaultCity.toLowerCase())) {
                searchText = searchText + ", " + defaultCity;
            }

            SearchPlaceIndexForTextRequest request = SearchPlaceIndexForTextRequest.builder()
                    .indexName(placeIndexName)
                    .text(searchText)
                    .maxResults(1)
                    .build();

            SearchPlaceIndexForTextResponse response = locationClient.searchPlaceIndexForText(request);
            if (response.hasResults() && !response.results().isEmpty()) {
                return response.results().get(0).place().geometry().point(); // [longitude, latitude]
            }
        } catch (Exception e) {
            System.err.println("[AwsLocationService] Geocoding failed for \"" + address + "\": " + e.getMessage());
        }
        return null;
    }

    /**
     * Calculates ETA and distance between current coordinates and a text-based destination.
     */
    public LocationEta getEtaAndDistance(Double originLat, Double originLng, String destinationStop) {
        if (locationClient == null) {
            System.out.println("[AwsLocationService] AWS Location client not initialized. Skipping call.");
            return null;
        }

        try {
            List<Double> destPoint = geocodeAddress(destinationStop);
            if (destPoint == null) {
                System.err.println("[AwsLocationService] Could not geocode destination: " + destinationStop);
                return null;
            }

            CalculateRouteRequest routeRequest = CalculateRouteRequest.builder()
                    .calculatorName(routeCalculatorName)
                    .departurePosition(List.of(originLng, originLat)) // AWS expects [lng, lat]
                    .destinationPosition(destPoint)
                    .build();

            CalculateRouteResponse routeResponse = locationClient.calculateRoute(routeRequest);
            double distanceMeters = routeResponse.summary().distance() * 1000.0; // convert km to meters
            double durationSeconds = routeResponse.summary().durationSeconds();

            return new LocationEta(durationSeconds, distanceMeters);
        } catch (Exception e) {
            System.err.println("[AwsLocationService] Route calculation failed: " + e.getMessage());
            return null;
        }
    }

    /**
     * Sorts a list of stop addresses using a Nearest Neighbor (greedy TSP) algorithm,
     * and calculates the total route distance with waypoints via AWS Location Service.
     */
    public LocationOptimization optimizeRoute(List<String> stops) {
        if (locationClient == null || stops == null || stops.size() <= 2) {
            return null;
        }

        try {
            List<List<Double>> coords = new ArrayList<>();
            List<String> validStops = new ArrayList<>();

            for (String stop : stops) {
                List<Double> pt = geocodeAddress(stop);
                if (pt != null) {
                    coords.add(pt);
                    validStops.add(stop);
                } else {
                    System.err.println("[AwsLocationService] Skipping stop due to geocoding failure: " + stop);
                }
            }

            if (coords.size() < 2) {
                return null;
            }

            // Nearest Neighbor TSP implementation starting at index 0 (the depot / School)
            List<Integer> optimizedIndices = new ArrayList<>();
            boolean[] visited = new boolean[coords.size()];

            optimizedIndices.add(0);
            visited[0] = true;

            int currentIdx = 0;
            while (optimizedIndices.size() < coords.size()) {
                int nextIdx = -1;
                double minDistance = Double.MAX_VALUE;
                List<Double> currentCoords = coords.get(currentIdx);

                for (int i = 0; i < coords.size(); i++) {
                    if (!visited[i]) {
                        double dist = haversineDistance(
                                currentCoords.get(1), currentCoords.get(0), // lat1, lon1
                                coords.get(i).get(1), coords.get(i).get(0)   // lat2, lon2
                        );
                        if (dist < minDistance) {
                            minDistance = dist;
                            nextIdx = i;
                        }
                    }
                }
                if (nextIdx == -1) {
                    break;
                }
                visited[nextIdx] = true;
                optimizedIndices.add(nextIdx);
                currentIdx = nextIdx;
            }

            // Reconstruct optimized stops sequence
            List<String> optimizedStops = new ArrayList<>();
            for (int idx : optimizedIndices) {
                optimizedStops.add(validStops.get(idx));
            }

            // Fetch final routed distance from AWS using waypoints
            List<Double> departure = coords.get(optimizedIndices.get(0));
            List<Double> destination = coords.get(optimizedIndices.get(optimizedIndices.size() - 1));

            List<List<Double>> waypoints = new ArrayList<>();
            for (int i = 1; i < optimizedIndices.size() - 1; i++) {
                waypoints.add(coords.get(optimizedIndices.get(i)));
            }

            CalculateRouteRequest.Builder routeRequestBuilder = CalculateRouteRequest.builder()
                    .calculatorName(routeCalculatorName)
                    .departurePosition(departure)
                    .destinationPosition(destination);

            if (!waypoints.isEmpty()) {
                routeRequestBuilder.waypointPositions(waypoints);
            }

            CalculateRouteResponse routeResponse = locationClient.calculateRoute(routeRequestBuilder.build());
            double totalDistanceKm = routeResponse.summary().distance();

            return new LocationOptimization(optimizedStops, Math.round(totalDistanceKm * 100.0) / 100.0);

        } catch (Exception e) {
            System.err.println("[AwsLocationService] Route optimization calculation failed: " + e.getMessage());
            return null;
        }
    }

    private double haversineDistance(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371; // Earth radius in km
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                   Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                   Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}
