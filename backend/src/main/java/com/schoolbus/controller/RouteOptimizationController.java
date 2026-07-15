package com.schoolbus.controller;

import com.schoolbus.model.RouteOptimization;
import com.schoolbus.service.RouteOptimizationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/route-optimization")
public class RouteOptimizationController {

    @Autowired
    private RouteOptimizationService routeOptimizationService;

    @GetMapping("/history")
    public List<RouteOptimization> getHistory() {
        return routeOptimizationService.getHistory();
    }

    @PostMapping("/generate")
    public ResponseEntity<?> generate(@RequestBody Map<String, Object> payload) {
        try {
            Long routeId = Long.valueOf(payload.get("routeId").toString());
            String trafficLevel = (String) payload.getOrDefault("trafficLevel", "Light");
            String roadClosures = (String) payload.getOrDefault("roadClosures", "None");
            String weather = (String) payload.getOrDefault("weather", "Sunny");

            RouteOptimization opt = routeOptimizationService.generateOptimization(routeId, trafficLevel, roadClosures, weather);
            return ResponseEntity.ok(opt);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @Autowired
    private com.schoolbus.service.AwsLocationService awsLocationService;

    @PostMapping("/optimize")
    public ResponseEntity<?> optimize(@RequestBody Map<String, Object> payload) {
        try {
            Object stopsObj = payload.get("stops");
            if (!(stopsObj instanceof List<?>)) {
                return ResponseEntity.badRequest().body(Map.of("message", "Stops list is required"));
            }
            List<String> stops = ((List<?>) stopsObj).stream()
                    .map(Object::toString)
                    .toList();
            if (stops.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("message", "Stops list is required"));
            }

            com.schoolbus.service.AwsLocationService.LocationOptimization result = awsLocationService.optimizeRoute(stops);
            if (result == null) {
                return ResponseEntity.status(503).body(Map.of("message", "AWS Location Service is not configured or offline"));
            }

            return ResponseEntity.ok(Map.of(
                "optimizedStops", result.optimizedStops,
                "optimizedDistance", result.optimizedDistance,
                "source", "AWS Location Routing"
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
