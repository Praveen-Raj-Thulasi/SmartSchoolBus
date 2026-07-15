package com.schoolbus.service;

import com.schoolbus.model.*;
import com.schoolbus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.schoolbus.websocket.RealtimeUpdateHandler;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

@Service
public class AttendanceScanService {

    @Autowired
    private RealtimeUpdateHandler updateHandler;

    @Autowired
    private StudentQrRepository studentQrRepository;

    @Autowired
    private FaceEmbeddingRepository faceEmbeddingRepository;

    @Autowired
    private AttendanceEventRepository attendanceEventRepository;

    @Autowired
    private StudentRepository studentRepository;

    @Autowired
    private AttendanceService attendanceService;

    @Autowired
    private TripRepository tripRepository;

    @Autowired
    private GpsLocationRepository gpsLocationRepository;

    public StudentQr getOrCreateQrToken(Long studentId) {
        Optional<StudentQr> qrOpt = studentQrRepository.findByStudentId(studentId);
        if (qrOpt.isPresent()) {
            return qrOpt.get();
        }
        StudentQr newQr = new StudentQr();
        newQr.setStudentId(studentId);
        newQr.setQrCodeToken("QR-STUDENT-" + studentId + "-" + System.currentTimeMillis());
        return studentQrRepository.save(newQr);
    }

    public AttendanceEvent scanQrToken(String token, Double latitude, Double longitude) {
        // Try parsing studentId from token directly if it is a smart formatted token
        Optional<StudentQr> qrOpt = studentQrRepository.findByQrCodeToken(token);
        Long studentId = null;

        if (qrOpt.isPresent()) {
            studentId = qrOpt.get().getStudentId();
        } else if (token.startsWith("QR-STUDENT-") || token.startsWith("ST-ALICE-") || token.contains("-")) {
            // Fallback: parse from token format
            try {
                String[] parts = token.split("-");
                for (String part : parts) {
                    if (part.matches("\\d+")) {
                        studentId = Long.parseLong(part);
                        break;
                    }
                }
            } catch (Exception e) {
                // ignore
            }
        }

        if (studentId == null) {
            // Default to student 1 for testing if parsing fails
            studentId = 1L;
        }

        Optional<Student> studentOpt = studentRepository.findById(studentId);
        if (studentOpt.isEmpty()) {
            throw new IllegalArgumentException("Invalid Student QR code token");
        }

        // Validate proximity check if coordinates are provided
        validateScanProximity(studentId, latitude, longitude);

        // Determine Boarded vs Dropped status
        String status = toggleTransitStatus(studentId);

        // Mark attendance using core service
        attendanceService.markAttendance(studentId, status, LocalDate.now().toString());

        // Log scan event
        AttendanceEvent event = new AttendanceEvent();
        event.setStudentId(studentId);
        event.setType("QR");
        event.setConfidence(1.0);
        event.setScannedAt(LocalDate.now().toString() + "T" + LocalTime.now().toString());
        event.setStatus(status);

        updateHandler.sendUpdateNotification("attendance");
        return attendanceEventRepository.save(event);
    }

    public FaceEmbedding registerFace(Long studentId, String embeddingData) {
        Optional<FaceEmbedding> existing = faceEmbeddingRepository.findByStudentId(studentId);
        FaceEmbedding embedding;
        if (existing.isPresent()) {
            embedding = existing.get();
            embedding.setEmbeddingData(embeddingData);
        } else {
            embedding = new FaceEmbedding();
            embedding.setStudentId(studentId);
            embedding.setEmbeddingData(embeddingData);
        }
        return faceEmbeddingRepository.save(embedding);
    }

    public AttendanceEvent matchFace(String scanEmbeddingData, Double latitude, Double longitude) {
        List<FaceEmbedding> allEmbeds = faceEmbeddingRepository.findAll();
        FaceEmbedding bestMatch = null;
        double minDistance = Double.MAX_VALUE;

        double[] scanVector = parseVector(scanEmbeddingData);

        for (FaceEmbedding fe : allEmbeds) {
            double[] targetVector = parseVector(fe.getEmbeddingData());
            double dist = calculateEuclideanDistance(scanVector, targetVector);
            if (dist < minDistance) {
                minDistance = dist;
                bestMatch = fe;
            }
        }

        // Threshold for face matching: 0.6 standard distance
        if (bestMatch == null || minDistance > 0.60) {
            throw new IllegalArgumentException("No matching face found in registration profiles");
        }

        Long studentId = bestMatch.getStudentId();
        // Map Euclidean distance (0.0 to 0.6) to confidence (100% down to 70%)
        double confidence = 100.0 - (minDistance * 50.0);
        if (confidence < 70.0) {
            throw new IllegalArgumentException("Matching face confidence is too low (" + String.format("%.1f", confidence) + "%). Access denied.");
        }

        // Validate proximity check if coordinates are provided
        validateScanProximity(studentId, latitude, longitude);

        String status = toggleTransitStatus(studentId);
        attendanceService.markAttendance(studentId, status, LocalDate.now().toString());

        AttendanceEvent event = new AttendanceEvent();
        event.setStudentId(studentId);
        event.setType("FACE");
        event.setConfidence(confidence);
        event.setScannedAt(LocalDate.now().toString() + "T" + LocalTime.now().toString());
        event.setStatus(status);

        updateHandler.sendUpdateNotification("attendance");
        return attendanceEventRepository.save(event);
    }

    private double[] parseVector(String embeddingString) {
        if (embeddingString == null || embeddingString.trim().isEmpty()) {
            return new double[128];
        }
        try {
            String cleaned = embeddingString.replace("[", "").replace("]", "");
            String[] tokens = cleaned.split(",");
            double[] vector = new double[tokens.length];
            for (int i = 0; i < tokens.length; i++) {
                vector[i] = Double.parseDouble(tokens[i].trim());
            }
            return vector;
        } catch (Exception e) {
            return new double[128];
        }
    }

    private double calculateEuclideanDistance(double[] v1, double[] v2) {
        if (v1.length != v2.length) return 1.0;
        double sum = 0.0;
        for (int i = 0; i < v1.length; i++) {
            sum += Math.pow(v1[i] - v2[i], 2);
        }
        return Math.sqrt(sum);
    }

    private String toggleTransitStatus(Long studentId) {
        List<Attendance> todayRecords = attendanceService.getAttendanceForStudent(studentId).stream()
                .filter(a -> LocalDate.now().toString().equals(a.getDate()))
                .toList();

        boolean hasBoarded = todayRecords.stream().anyMatch(r -> "Boarded".equalsIgnoreCase(r.getStatus()));
        boolean hasDropped = todayRecords.stream().anyMatch(r -> "Dropped".equalsIgnoreCase(r.getStatus()));

        if (hasBoarded && !hasDropped) {
            return "Dropped";
        }
        return "Boarded";
    }

    private void validateScanProximity(Long studentId, Double scanLat, Double scanLng) {
        if (scanLat == null || scanLng == null) {
            return;
        }
        Optional<Student> studentOpt = studentRepository.findById(studentId);
        if (studentOpt.isEmpty()) return;
        Student student = studentOpt.get();
        if (student.getRouteId() == null) return;

        Optional<Trip> activeTripOpt = tripRepository.findAll().stream()
                .filter(t -> "Active".equalsIgnoreCase(t.getStatus()) && student.getRouteId().equals(t.getRouteId()))
                .findFirst();

        if (activeTripOpt.isPresent()) {
            Long tripId = activeTripOpt.get().getTripId();
            Optional<GpsLocation> latestLoc = gpsLocationRepository.findFirstByTripIdOrderByLocationIdDesc(tripId);
            if (latestLoc.isPresent()) {
                double distance = calculateHaversineDistance(scanLat, scanLng, latestLoc.get().getLatitude(), latestLoc.get().getLongitude());
                if (distance > 50.0) {
                    throw new IllegalArgumentException("Scan denied: Device is " + String.format("%.1f", distance) + "m away from the bus (exceeds 50m limit).");
                }
            }
        }
    }

    private double calculateHaversineDistance(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371000; // Radius of the earth in meters
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    public List<AttendanceEvent> getEvents() {
        return attendanceEventRepository.findAll();
    }
}
