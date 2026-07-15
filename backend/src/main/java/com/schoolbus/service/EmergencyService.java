package com.schoolbus.service;

import com.schoolbus.model.*;
import com.schoolbus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.schoolbus.websocket.RealtimeUpdateHandler;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class EmergencyService {

    @Autowired
    private RealtimeUpdateHandler updateHandler;

    @Autowired
    private EmergencyRepository emergencyRepository;

    @Autowired
    private TripRepository tripRepository;

    @Autowired
    private BusRepository busRepository;

    @Autowired
    private RouteRepository routeRepository;

    @Autowired
    private StudentRepository studentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationService notificationService;

    public Emergency triggerEmergency(Long tripId, String reason, Double lat, Double lng, Integer onboardCount) {
        Optional<Trip> tripOpt = tripRepository.findById(tripId);
        if (tripOpt.isEmpty()) {
            throw new IllegalArgumentException("Trip not found: " + tripId);
        }
        Trip trip = tripOpt.get();

        // Retrieve driver and bus info
        Long driverId = trip.getDriverId();
        Long busId = trip.getBusId();

        Optional<Bus> busOpt = busRepository.findById(busId);
        String busNumber = busOpt.isPresent() ? busOpt.get().getBusNumber() : "Unknown";

        // Create Emergency record
        Emergency emergency = new Emergency();
        emergency.setTripId(tripId);
        emergency.setDriverId(driverId);
        emergency.setBusId(busId);
        emergency.setLatitude(lat);
        emergency.setLongitude(lng);
        emergency.setReason(reason);
        emergency.setStatus("Open");
        emergency.setStudentsOnboard(onboardCount != null ? onboardCount : 0);

        Emergency saved = emergencyRepository.save(emergency);

        // Update trip status to 'Emergency'
        trip.setStatus("Emergency");
        if (trip.getLogs() != null) {
            trip.getLogs().add("🚨 SOS Triggered: " + reason + " at coords " + lat + "," + lng);
        }
        tripRepository.save(trip);

        // Update bus status to 'Emergency'
        if (busOpt.isPresent()) {
            Bus bus = busOpt.get();
            bus.setCurrentStatus("Emergency");
            busRepository.save(bus);
        }

        // Notify Administrator
        userRepository.findAll().stream()
            .filter(u -> "admin".equalsIgnoreCase(u.getRole()))
            .findFirst()
            .ifPresent(admin -> {
                notificationService.createNotification(
                    admin.getUserId(),
                    String.format("🚨 SOS ALARM: Bus %s triggered an SOS alert! Reason: %s. Onboard: %d.", 
                        busNumber, reason, emergency.getStudentsOnboard()),
                    "Emergency SOS"
                );
            });

        // Notify parents of students assigned to this route
        Optional<Route> routeOpt = routeRepository.findById(trip.getRouteId());
        if (routeOpt.isPresent()) {
            List<Student> routeStudents = studentRepository.findAll().stream()
                .filter(s -> trip.getRouteId().equals(s.getRouteId()))
                .toList();

            for (Student student : routeStudents) {
                if (student.getParentId() == null) continue;

                userRepository.findAll().stream()
                    .filter(u -> student.getParentId().equals(u.getParentId()))
                    .findFirst()
                    .ifPresent(parentUser -> {
                        notificationService.createNotification(
                            parentUser.getUserId(),
                            String.format("🚨 EMERGENCY BUS ALERT: Your child's bus (%s) reported an emergency: %s. Rescue dispatch in progress. View: http://maps.google.com/?q=%f,%f", 
                                busNumber, reason, lat, lng),
                            "Emergency SOS"
                        );
                    });
            }
        }

        updateHandler.sendUpdateNotification("emergencies");
        updateHandler.sendUpdateNotification("trips");
        return saved;
    }

    public Emergency resolveEmergency(Long emergencyId, String resolutionNotes) {
        Optional<Emergency> emergencyOpt = emergencyRepository.findById(emergencyId);
        if (emergencyOpt.isEmpty()) {
            throw new IllegalArgumentException("Emergency not found: " + emergencyId);
        }
        Emergency emergency = emergencyOpt.get();
        emergency.setStatus("Resolved");
        emergency.setResolvedAt(LocalDateTime.now().toString());
        emergency.setResolutionNotes(resolutionNotes);

        Emergency saved = emergencyRepository.save(emergency);

        // Revert trip status to 'Active' so it can continue, or 'Completed' if they had to cancel it
        Optional<Trip> tripOpt = tripRepository.findById(emergency.getTripId());
        if (tripOpt.isPresent()) {
            Trip trip = tripOpt.get();
            trip.setStatus("Active");
            if (trip.getLogs() != null) {
                trip.getLogs().add("✅ SOS Resolved: " + resolutionNotes);
            }
            tripRepository.save(trip);
        }

        // Revert bus status to 'Active'
        Optional<Bus> busOpt = busRepository.findById(emergency.getBusId());
        if (busOpt.isPresent()) {
            Bus bus = busOpt.get();
            bus.setCurrentStatus("Active");
            busRepository.save(bus);
        }

        // Notify parents and admins of resolution
        userRepository.findAll().stream()
            .filter(u -> "admin".equalsIgnoreCase(u.getRole()))
            .findFirst()
            .ifPresent(admin -> {
                notificationService.createNotification(
                    admin.getUserId(),
                    String.format("✅ SOS Cleared: Emergency on Bus #%d resolved. Notes: %s", 
                        emergency.getBusId(), resolutionNotes),
                    "Emergency Resolved"
                );
            });

        updateHandler.sendUpdateNotification("emergencies");
        updateHandler.sendUpdateNotification("trips");
        return saved;
    }

    public List<Emergency> getActiveEmergencies() {
        return emergencyRepository.findByStatus("Open");
    }

    public List<Emergency> getAllEmergencies() {
        return emergencyRepository.findAll();
    }
}
