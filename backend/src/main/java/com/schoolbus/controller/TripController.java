package com.schoolbus.controller;

import com.schoolbus.model.Trip;
import com.schoolbus.service.TripService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/trips")
public class TripController {

    @Autowired
    private TripService tripService;

    @GetMapping
    public List<Trip> getAllTrips() {
        return tripService.getAllTrips();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Trip> getTripById(@PathVariable Long id) {
        return tripService.getTripById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/start")
    public ResponseEntity<Trip> startTrip(@RequestBody Map<String, Object> payload) {
        Long routeId = payload.get("routeId") != null ? Long.valueOf(payload.get("routeId").toString()) : null;
        Long busId = payload.get("busId") != null ? Long.valueOf(payload.get("busId").toString()) : null;
        Long driverId = payload.get("driverId") != null ? Long.valueOf(payload.get("driverId").toString()) : null;

        if (routeId == null || busId == null || driverId == null) {
            return ResponseEntity.badRequest().build();
        }

        try {
            Trip trip = tripService.startTrip(routeId, busId, driverId);
            return ResponseEntity.ok(trip);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/{tripId}/advance")
    public ResponseEntity<Trip> advanceTrip(@PathVariable Long tripId) {
        try {
            Trip trip = tripService.advanceTripStop(tripId);
            return ResponseEntity.ok(trip);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/{tripId}/end")
    public ResponseEntity<Trip> endTrip(@PathVariable Long tripId) {
        try {
            Trip trip = tripService.endTrip(tripId);
            return ResponseEntity.ok(trip);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/{tripId}/emergency")
    public ResponseEntity<Trip> triggerEmergency(@PathVariable Long tripId, @RequestBody Map<String, String> payload) {
        String message = payload.get("message");
        if (message == null || message.trim().isEmpty()) {
            message = "Unspecified emergency";
        }
        try {
            Trip trip = tripService.triggerEmergency(tripId, message);
            return ResponseEntity.ok(trip);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/{tripId}/clear-emergency")
    public ResponseEntity<Trip> clearEmergency(@PathVariable Long tripId) {
        try {
            Trip trip = tripService.clearEmergency(tripId);
            return ResponseEntity.ok(trip);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/{tripId}/deviate")
    public ResponseEntity<Trip> triggerDeviation(@PathVariable Long tripId, @RequestBody Map<String, String> payload) {
        String message = payload.get("message");
        if (message == null || message.trim().isEmpty()) {
            message = "Unspecified deviation";
        }
        try {
            Trip trip = tripService.triggerDeviation(tripId, message);
            return ResponseEntity.ok(trip);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/{tripId}/clear-deviate")
    public ResponseEntity<Trip> clearDeviation(@PathVariable Long tripId) {
        try {
            Trip trip = tripService.clearDeviation(tripId);
            return ResponseEntity.ok(trip);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
