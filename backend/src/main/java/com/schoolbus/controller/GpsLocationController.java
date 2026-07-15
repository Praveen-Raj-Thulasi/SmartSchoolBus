package com.schoolbus.controller;

import com.schoolbus.model.DelayPrediction;
import com.schoolbus.model.GpsLocation;
import com.schoolbus.service.GpsLocationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/gps")
public class GpsLocationController {

    @Autowired
    private GpsLocationService gpsLocationService;

    @PostMapping("/ping")
    public ResponseEntity<?> ping(@RequestBody Map<String, Object> payload) {
        try {
            Long tripId = Long.valueOf(payload.get("tripId").toString());
            Double lat = Double.valueOf(payload.get("latitude").toString());
            Double lng = Double.valueOf(payload.get("longitude").toString());
            Double speed = Double.valueOf(payload.getOrDefault("speed", 0.0).toString());

            GpsLocation loc = gpsLocationService.savePing(tripId, lat, lng, speed);
            return ResponseEntity.ok(loc);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/trip/{tripId}/latest")
    public ResponseEntity<?> getLatest(@PathVariable Long tripId) {
        Optional<GpsLocation> loc = gpsLocationService.getLatestLocation(tripId);
        if (loc.isPresent()) {
            return ResponseEntity.ok(loc.get());
        }
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/trip/{tripId}/history")
    public List<GpsLocation> getHistory(@PathVariable Long tripId) {
        return gpsLocationService.getLocationHistory(tripId);
    }

    @GetMapping("/trip/{tripId}/prediction")
    public ResponseEntity<?> getPrediction(@PathVariable Long tripId) {
        Optional<DelayPrediction> pred = gpsLocationService.getLatestPrediction(tripId);
        if (pred.isPresent()) {
            return ResponseEntity.ok(pred.get());
        }
        return ResponseEntity.notFound().build();
    }
}
