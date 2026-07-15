package com.schoolbus.controller;

import com.schoolbus.model.Grievance;
import com.schoolbus.service.GrievanceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/grievances")
public class GrievanceController {

    @Autowired
    private GrievanceService grievanceService;

    @GetMapping
    public List<Grievance> getAllGrievances() {
        return grievanceService.getAllGrievances();
    }

    @GetMapping("/parent/{parentId}")
    public List<Grievance> getGrievancesByParent(@PathVariable Long parentId) {
        return grievanceService.getGrievancesByParent(parentId);
    }

    @PostMapping
    public ResponseEntity<?> submitGrievance(@RequestBody Map<String, Object> payload) {
        try {
            Long parentId = Long.valueOf(payload.get("parentId").toString());
            String title = payload.get("title").toString();
            String category = payload.get("category").toString();
            String description = payload.get("description").toString();

            Grievance grievance = grievanceService.submitGrievance(parentId, title, category, description);
            return ResponseEntity.ok(grievance);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/{grievanceId}/resolve")
    public ResponseEntity<?> resolveGrievance(@PathVariable Long grievanceId, @RequestBody Map<String, String> payload) {
        try {
            String resolutionNotes = payload.getOrDefault("resolutionNotes", "Resolved by Admin");
            Grievance grievance = grievanceService.resolveGrievance(grievanceId, resolutionNotes);
            return ResponseEntity.ok(grievance);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
