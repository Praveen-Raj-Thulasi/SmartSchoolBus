package com.schoolbus.controller;

import com.schoolbus.model.Emergency;
import com.schoolbus.service.EmergencyService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/emergency")
public class EmergencyController {

    @Autowired
    private EmergencyService emergencyService;

    @GetMapping
    public List<Emergency> getAll() {
        return emergencyService.getAllEmergencies();
    }

    @GetMapping("/active")
    public List<Emergency> getActive() {
        return emergencyService.getActiveEmergencies();
    }

    @PostMapping("/trigger")
    public ResponseEntity<?> trigger(@RequestBody Map<String, Object> payload) {
        try {
            Long tripId = Long.valueOf(payload.get("tripId").toString());
            String reason = payload.get("reason").toString();
            Double lat = Double.valueOf(payload.get("latitude").toString());
            Double lng = Double.valueOf(payload.get("longitude").toString());
            Integer onboardCount = Integer.valueOf(payload.getOrDefault("studentsOnboard", 0).toString());

            Emergency em = emergencyService.triggerEmergency(tripId, reason, lat, lng, onboardCount);
            return ResponseEntity.ok(em);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/{emergencyId}/resolve")
    public ResponseEntity<?> resolve(@PathVariable Long emergencyId, @RequestBody Map<String, String> payload) {
        try {
            String notes = payload.getOrDefault("resolutionNotes", "Resolved by Admin");
            Emergency em = emergencyService.resolveEmergency(emergencyId, notes);
            return ResponseEntity.ok(em);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
