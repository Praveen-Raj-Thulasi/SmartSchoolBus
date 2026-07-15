package com.schoolbus.service;

import com.schoolbus.model.*;
import com.schoolbus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.schoolbus.websocket.RealtimeUpdateHandler;
import java.time.Instant;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class TripService {

    @Autowired
    private RealtimeUpdateHandler updateHandler;

    @Autowired
    private TripRepository tripRepository;

    @Autowired
    private BusRepository busRepository;

    @Autowired
    private DriverRepository driverRepository;

    @Autowired
    private RouteRepository routeRepository;

    @Autowired
    private StudentRepository studentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private LeaveRequestRepository leaveRequestRepository;

    public List<Trip> getAllTrips() {
        return tripRepository.findAll();
    }

    public Optional<Trip> getTripById(Long tripId) {
        return tripRepository.findById(tripId);
    }

    public Trip startTrip(Long routeId, Long busId, Long driverId) {
        Optional<Bus> busOpt = busRepository.findById(busId);
        Optional<Driver> driverOpt = driverRepository.findById(driverId);
        Optional<Route> routeOpt = routeRepository.findById(routeId);

        if (!busOpt.isPresent() || !driverOpt.isPresent() || !routeOpt.isPresent()) {
            throw new RuntimeException("Bus, Driver, or Route not found");
        }

        List<String> activeStatuses = List.of("Active", "Emergency");
        List<Trip> activeDriverTrips = tripRepository.findByDriverIdAndStatusIn(driverId, activeStatuses);
        if (!activeDriverTrips.isEmpty()) {
            throw new RuntimeException("Driver already has an active or emergency trip associated with them.");
        }
        List<Trip> activeBusTrips = tripRepository.findByBusIdAndStatusIn(busId, activeStatuses);
        if (!activeBusTrips.isEmpty()) {
            throw new RuntimeException("Bus already has an active or emergency trip associated with them.");
        }

        Bus originalBus = busOpt.get();
        Driver driver = driverOpt.get();
        Route route = routeOpt.get();

        // Validate Bus Maintenance Status
        if (!"Good".equalsIgnoreCase(originalBus.getMaintenanceStatus())) {
            throw new RuntimeException("Bus " + originalBus.getBusNumber() + " cannot start trip. Maintenance status is: " + originalBus.getMaintenanceStatus());
        }

        // Validate Driver License
        if (driver.getLicenseNumber() == null || driver.getLicenseNumber().trim().isEmpty() || driver.getLicenseNumber().length() < 5) {
            throw new RuntimeException("Driver " + driver.getName() + " has an invalid or missing license number.");
        }

        // 1. Determine active trip coverage type (Morning vs Evening) based on current hour
        String currentTripType = LocalTime.now().isBefore(LocalTime.NOON) ? "Morning" : "Evening";
        String todayDate = java.time.LocalDate.now().toString();

        // 2. Query all students assigned to this route
        List<Student> routeStudents = studentRepository.findByRouteId(routeId);

        // 3. Filter out students who have approved leave requests for today's trip coverage
        List<LeaveRequest> todayLeaves = leaveRequestRepository.findByDate(todayDate);
        long attendingCount = routeStudents.stream()
                .filter(student -> {
                    boolean isAbsent = todayLeaves.stream()
                            .anyMatch(leave -> leave.getStudentId().equals(student.getStudentId()) 
                                    && ("Approved".equalsIgnoreCase(leave.getStatus()))
                                    && ("Both".equalsIgnoreCase(leave.getTripType()) 
                                        || currentTripType.equalsIgnoreCase(leave.getTripType())));
                    return !isAbsent;
                })
                .count();

        // 4. Find the best bus (Idle status or the originally assigned bus)
        // that can fit the attendingCount and has the lowest capacity.
        List<Bus> allBuses = busRepository.findAll();
        Bus selectedBus = originalBus;
        int minFittingCapacity = Integer.MAX_VALUE;

        for (Bus candidate : allBuses) {
            boolean isAvailable = "Idle".equalsIgnoreCase(candidate.getCurrentStatus()) 
                    || candidate.getBusId().equals(busId);
            if (isAvailable && candidate.getCapacity() >= attendingCount) {
                if (candidate.getCapacity() < minFittingCapacity) {
                    minFittingCapacity = candidate.getCapacity();
                    selectedBus = candidate;
                }
            }
        }

        // 5. Update selected bus status
        selectedBus.setCurrentStatus("On Trip");
        busRepository.save(selectedBus);

        Trip trip = new Trip();
        trip.setRouteId(routeId);
        trip.setBusId(selectedBus.getBusId());
        trip.setDriverId(driverId);
        trip.setStartTime(Instant.now().toString());
        trip.setStatus("Active");
        trip.setCurrentStopIndex(0);
        trip.setDistanceCovered("0 km");

        List<String> logs = new ArrayList<>();
        long absentCount = routeStudents.size() - attendingCount;
        logs.add(String.format("Trip started by %s on route %s.", driver.getName(), route.getRouteName()));
        if (absentCount > 0) {
            logs.add(String.format("[ABSENCE PLANNER] Attending passengers: %d/%d (%d absent on %s trip). Optimized to Bus %s (Capacity %d).", 
                    attendingCount, routeStudents.size(), absentCount, currentTripType, selectedBus.getBusNumber(), selectedBus.getCapacity()));
        } else {
            logs.add(String.format("Assigned Bus %s (Capacity %d) to accommodate all %d passengers.", 
                    selectedBus.getBusNumber(), selectedBus.getCapacity(), attendingCount));
        }
        trip.setLogs(logs);

        Trip savedTrip = tripRepository.save(trip);

        // Notify parents matching React logic
        final Bus finalBus = selectedBus;
        for (Student student : routeStudents) {
            if (student.getParentId() != null) {
                userRepository.findAll().stream()
                        .filter(u -> student.getParentId().equals(u.getParentId()))
                        .findFirst()
                        .ifPresent(parentUser -> {
                            notificationService.createNotification(
                                    parentUser.getUserId(),
                                    String.format("Bus %s has started its trip on route \"%s\".", finalBus.getBusNumber(), route.getRouteName()),
                                    "Bus Started"
                            );
                        });
            }
        }

        updateHandler.sendUpdateNotification("trips");
        return savedTrip;
    }

    public Trip advanceTripStop(Long tripId) {
        Optional<Trip> tripOpt = tripRepository.findById(tripId);
        if (!tripOpt.isPresent()) {
            throw new RuntimeException("Trip not found");
        }

        Trip trip = tripOpt.get();
        if ("Emergency".equalsIgnoreCase(trip.getStatus())) {
            throw new RuntimeException("Trip is in an Emergency state. Route progression is blocked.");
        }
        if (!"Active".equals(trip.getStatus())) {
            throw new RuntimeException("Active Trip not found");
        }
        Optional<Route> routeOpt = routeRepository.findById(trip.getRouteId());
        if (!routeOpt.isPresent()) {
            throw new RuntimeException("Route not found");
        }

        Route route = routeOpt.get();
        List<String> stops = route.getStops();
        if (stops == null || stops == null) {
            throw new RuntimeException("Route has no stops");
        }

        int nextStopIndex = trip.getCurrentStopIndex() + 1;
        String passedStop = stops.get(trip.getCurrentStopIndex());

        List<String> logs = new ArrayList<>(trip.getLogs());
        logs.add(String.format("Passed stop: %s.", passedStop));
        trip.setLogs(logs);

        if (nextStopIndex >= stops.size()) {
            nextStopIndex = 0;
        }
        trip.setCurrentStopIndex(nextStopIndex);

        // Calculate distance covered matching React logic
        try {
            int totalDist = Integer.parseInt(route.getDistance().replaceAll("[^0-9]", ""));
            double ratio = (double) nextStopIndex / (stops.size() - 1);
            trip.setDistanceCovered(Math.round(ratio * totalDist) + " km");
        } catch (Exception e) {
            trip.setDistanceCovered(nextStopIndex + " km");
        }

        Trip savedTrip = tripRepository.save(trip);

        // Notify parents of students at the next stop
        if (nextStopIndex < stops.size()) {
            String nextStopName = stops.get(nextStopIndex);
            List<Student> routeStudents = studentRepository.findByRouteId(trip.getRouteId());
            for (Student student : routeStudents) {
                if (student.getParentId() != null && nextStopName.equalsIgnoreCase(student.getAddress())) {
                    userRepository.findAll().stream()
                            .filter(u -> student.getParentId().equals(u.getParentId()))
                            .findFirst()
                            .ifPresent(parentUser -> {
                                notificationService.createNotification(
                                        parentUser.getUserId(),
                                        String.format("Bus is arriving shortly at stop \"%s\" for %s.", nextStopName, student.getName()),
                                        "Arrival Alert"
                                );
                            });
                }
            }
        }

        updateHandler.sendUpdateNotification("trips");
        return savedTrip;
    }

    public Trip endTrip(Long tripId) {
        Optional<Trip> tripOpt = tripRepository.findById(tripId);
        if (!tripOpt.isPresent()) {
            throw new RuntimeException("Trip not found");
        }

        Trip trip = tripOpt.get();
        Optional<Bus> busOpt = busRepository.findById(trip.getBusId());
        if (busOpt.isPresent()) {
            Bus bus = busOpt.get();
            bus.setCurrentStatus("Idle");
            busRepository.save(bus);
        }

        trip.setStatus("Completed");
        trip.setEndTime(Instant.now().toString());

        List<String> logs = new ArrayList<>(trip.getLogs());
        logs.add(String.format("Trip ended successfully at %s.", LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"))));
        trip.setLogs(logs);

        Trip savedTrip = tripRepository.save(trip);

        // Notify parents matching React logic
        List<Student> routeStudents = studentRepository.findByRouteId(trip.getRouteId());
        for (Student student : routeStudents) {
            if (student.getParentId() != null) {
                userRepository.findAll().stream()
                        .filter(u -> student.getParentId().equals(u.getParentId()))
                        .findFirst()
                        .ifPresent(parentUser -> {
                            notificationService.createNotification(
                                    parentUser.getUserId(),
                                    String.format("Trip for route has ended. Bus %s returned to base.", busOpt.isPresent() ? busOpt.get().getBusNumber() : ""),
                                    "Bus Ended"
                            );
                        });
            }
        }

        updateHandler.sendUpdateNotification("trips");
        return savedTrip;
    }

    public Trip triggerEmergency(Long tripId, String message) {
        Optional<Trip> tripOpt = tripRepository.findById(tripId);
        if (!tripOpt.isPresent()) {
            throw new RuntimeException("Trip not found");
        }

        Trip trip = tripOpt.get();
        trip.setStatus("Emergency");

        List<String> logs = new ArrayList<>(trip.getLogs());
        logs.add(String.format("[EMERGENCY] SOS Triggered: %s", message));
        trip.setLogs(logs);

        Trip savedTrip = tripRepository.save(trip);

        // Notify parents on the route
        List<Student> routeStudents = studentRepository.findByRouteId(trip.getRouteId());
        Optional<Bus> busOpt = busRepository.findById(trip.getBusId());
        String busNumber = busOpt.isPresent() ? busOpt.get().getBusNumber() : "";
        for (Student student : routeStudents) {
            if (student.getParentId() != null) {
                userRepository.findAll().stream()
                        .filter(u -> student.getParentId().equals(u.getParentId()))
                        .findFirst()
                        .ifPresent(parentUser -> {
                            notificationService.createNotification(
                                    parentUser.getUserId(),
                                    String.format("EMERGENCY ALERT: Bus %s on your route has triggered SOS: %s", busNumber, message),
                                    "Emergency Alert"
                            );
                        });
            }
        }

        // Notify school admins
        userRepository.findAll().stream()
                .filter(u -> "admin".equals(u.getRole()))
                .forEach(adminUser -> {
                    notificationService.createNotification(
                            adminUser.getUserId(),
                            String.format("EMERGENCY ALERT: Bus %s has triggered SOS: %s", busNumber, message),
                            "Emergency Alert"
                    );
                });

        updateHandler.sendUpdateNotification("trips");
        return savedTrip;
    }

    public Trip clearEmergency(Long tripId) {
        Optional<Trip> tripOpt = tripRepository.findById(tripId);
        if (!tripOpt.isPresent()) {
            throw new RuntimeException("Trip not found");
        }

        Trip trip = tripOpt.get();
        trip.setStatus("Active");

        List<String> logs = new ArrayList<>(trip.getLogs());
        logs.add("[EMERGENCY] SOS Cleared. Trip resumed.");
        trip.setLogs(logs);

        Trip savedTrip = tripRepository.save(trip);

        // Notify parents on the route
        List<Student> routeStudents = studentRepository.findByRouteId(trip.getRouteId());
        Optional<Bus> busOpt = busRepository.findById(trip.getBusId());
        String busNumber = busOpt.isPresent() ? busOpt.get().getBusNumber() : "";
        for (Student student : routeStudents) {
            if (student.getParentId() != null) {
                userRepository.findAll().stream()
                        .filter(u -> student.getParentId().equals(u.getParentId()))
                        .findFirst()
                        .ifPresent(parentUser -> {
                            notificationService.createNotification(
                                    parentUser.getUserId(),
                                    String.format("Emergency cleared. Bus %s has resumed normal operations.", busNumber),
                                    "Emergency Cleared"
                            );
                        });
            }
        }

        updateHandler.sendUpdateNotification("trips");
        return savedTrip;
    }

    public Trip triggerDeviation(Long tripId, String message) {
        Optional<Trip> tripOpt = tripRepository.findById(tripId);
        if (!tripOpt.isPresent()) {
            throw new RuntimeException("Trip not found");
        }

        Trip trip = tripOpt.get();
        if ("Emergency".equalsIgnoreCase(trip.getStatus())) {
            throw new RuntimeException("Trip is in an Emergency state. Deviation alarms are blocked.");
        }
        trip.setRouteDeviated(true);

        List<String> logs = new ArrayList<>(trip.getLogs());
        logs.add(String.format("[DEVIATION] Route Deviation Triggered: %s", message));
        trip.setLogs(logs);

        Trip savedTrip = tripRepository.save(trip);

        // Notify parents on the route
        List<Student> routeStudents = studentRepository.findByRouteId(trip.getRouteId());
        Optional<Bus> busOpt = busRepository.findById(trip.getBusId());
        String busNumber = busOpt.isPresent() ? busOpt.get().getBusNumber() : "";
        for (Student student : routeStudents) {
            if (student.getParentId() != null) {
                userRepository.findAll().stream()
                        .filter(u -> student.getParentId().equals(u.getParentId()))
                        .findFirst()
                        .ifPresent(parentUser -> {
                            notificationService.createNotification(
                                    parentUser.getUserId(),
                                    String.format("ROUTE DEVIATION ALERT: Bus %s on your route has drifted off-path: %s", busNumber, message),
                                    "Route Deviation"
                            );
                        });
            }
        }

        // Notify school admins
        userRepository.findAll().stream()
                .filter(u -> "admin".equals(u.getRole()))
                .forEach(adminUser -> {
                    notificationService.createNotification(
                            adminUser.getUserId(),
                            String.format("ROUTE DEVIATION ALERT: Bus %s is off-route: %s", busNumber, message),
                            "Route Deviation"
                    );
                });

        updateHandler.sendUpdateNotification("trips");
        return savedTrip;
    }

    public Trip clearDeviation(Long tripId) {
        Optional<Trip> tripOpt = tripRepository.findById(tripId);
        if (!tripOpt.isPresent()) {
            throw new RuntimeException("Trip not found");
        }

        Trip trip = tripOpt.get();
        trip.setRouteDeviated(false);

        List<String> logs = new ArrayList<>(trip.getLogs());
        logs.add("[DEVIATION] Route Deviation Cleared. Bus returned to path.");
        trip.setLogs(logs);

        Trip savedTrip = tripRepository.save(trip);

        // Notify parents on the route
        List<Student> routeStudents = studentRepository.findByRouteId(trip.getRouteId());
        Optional<Bus> busOpt = busRepository.findById(trip.getBusId());
        String busNumber = busOpt.isPresent() ? busOpt.get().getBusNumber() : "";
        for (Student student : routeStudents) {
            if (student.getParentId() != null) {
                userRepository.findAll().stream()
                        .filter(u -> student.getParentId().equals(u.getParentId()))
                        .findFirst()
                        .ifPresent(parentUser -> {
                            notificationService.createNotification(
                                    parentUser.getUserId(),
                                    String.format("Deviation cleared. Bus %s has returned to the route path.", busNumber),
                                    "Route Deviation Cleared"
                            );
                        });
            }
        }

        updateHandler.sendUpdateNotification("trips");
        return savedTrip;
    }
}
