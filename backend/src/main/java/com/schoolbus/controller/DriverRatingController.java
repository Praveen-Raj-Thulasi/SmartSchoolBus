package com.schoolbus.controller;

import com.schoolbus.model.DriverRating;
import com.schoolbus.service.DriverRatingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ratings")
public class DriverRatingController {

    @Autowired
    private DriverRatingService driverRatingService;

    @GetMapping
    public List<DriverRating> getAllRatings() {
        return driverRatingService.getAllRatings();
    }

    @GetMapping("/driver/{driverId}")
    public List<DriverRating> getRatingsForDriver(@PathVariable Long driverId) {
        return driverRatingService.getRatingsForDriver(driverId);
    }

    @GetMapping("/driver/{driverId}/average")
    public ResponseEntity<?> getAverageRatingForDriver(@PathVariable Long driverId) {
        Double avg = driverRatingService.getAverageRatingForDriver(driverId);
        return ResponseEntity.ok(Map.of("driverId", driverId, "averageRating", avg));
    }

    @GetMapping("/trip/{tripId}/parent/{parentId}")
    public ResponseEntity<?> getRatingByTripAndParent(@PathVariable Long tripId, @PathVariable Long parentId) {
        return driverRatingService.getRatingByTripAndParent(tripId, parentId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> submitRating(@RequestBody Map<String, Object> payload) {
        try {
            Long parentId = Long.valueOf(payload.get("parentId").toString());
            Long driverId = Long.valueOf(payload.get("driverId").toString());
            Long tripId = Long.valueOf(payload.get("tripId").toString());
            Integer stars = Integer.valueOf(payload.get("stars").toString());
            String comments = payload.getOrDefault("comments", "").toString();

            DriverRating rating = driverRatingService.submitRating(parentId, driverId, tripId, stars, comments);
            return ResponseEntity.ok(rating);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
