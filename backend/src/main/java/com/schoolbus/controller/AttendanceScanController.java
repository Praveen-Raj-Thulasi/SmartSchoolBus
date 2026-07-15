package com.schoolbus.controller;

import com.schoolbus.model.AttendanceEvent;
import com.schoolbus.model.FaceEmbedding;
import com.schoolbus.model.StudentQr;
import com.schoolbus.service.AttendanceScanService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/attendance/scan")
public class AttendanceScanController {

    @Autowired
    private AttendanceScanService attendanceScanService;

    @GetMapping("/events")
    public List<AttendanceEvent> getEvents() {
        return attendanceScanService.getEvents();
    }

    @GetMapping("/qr/{studentId}")
    public ResponseEntity<?> getQrToken(@PathVariable Long studentId) {
        StudentQr qr = attendanceScanService.getOrCreateQrToken(studentId);
        return ResponseEntity.ok(qr);
    }

    @PostMapping("/qr")
    public ResponseEntity<?> scanQr(@RequestBody Map<String, Object> payload) {
        try {
            String token = payload.get("token") != null ? payload.get("token").toString() : null;
            if (token == null || token.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("message", "QR token is required"));
            }
            Double latitude = (payload.get("latitude") != null && !payload.get("latitude").toString().trim().isEmpty()) 
                    ? Double.valueOf(payload.get("latitude").toString()) 
                    : null;
            Double longitude = (payload.get("longitude") != null && !payload.get("longitude").toString().trim().isEmpty()) 
                    ? Double.valueOf(payload.get("longitude").toString()) 
                    : null;

            AttendanceEvent event = attendanceScanService.scanQrToken(token, latitude, longitude);
            return ResponseEntity.ok(event);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/face/register")
    public ResponseEntity<?> registerFace(@RequestBody Map<String, Object> payload) {
        try {
            Long studentId = Long.valueOf(payload.get("studentId").toString());
            String embedding = payload.get("embedding") != null ? payload.get("embedding").toString() : null;
            if (embedding == null || embedding.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("message", "Embedding data is required"));
            }
            FaceEmbedding fe = attendanceScanService.registerFace(studentId, embedding);
            return ResponseEntity.ok(fe);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/face/match")
    public ResponseEntity<?> matchFace(@RequestBody Map<String, Object> payload) {
        try {
            String embedding = payload.get("embedding") != null ? payload.get("embedding").toString() : null;
            if (embedding == null || embedding.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("message", "Embedding scan data is required"));
            }
            Double latitude = (payload.get("latitude") != null && !payload.get("latitude").toString().trim().isEmpty()) 
                    ? Double.valueOf(payload.get("latitude").toString()) 
                    : null;
            Double longitude = (payload.get("longitude") != null && !payload.get("longitude").toString().trim().isEmpty()) 
                    ? Double.valueOf(payload.get("longitude").toString()) 
                    : null;

            AttendanceEvent event = attendanceScanService.matchFace(embedding, latitude, longitude);
            return ResponseEntity.ok(event);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
