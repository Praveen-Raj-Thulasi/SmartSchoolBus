package com.schoolbus.controller;

import com.schoolbus.model.Attendance;
import com.schoolbus.service.AttendanceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/attendance")
public class AttendanceController {

    @Autowired
    private AttendanceService attendanceService;

    @GetMapping
    public List<Attendance> getAllAttendance() {
        return attendanceService.getAllAttendance();
    }

    @GetMapping("/student/{studentId}")
    public List<Attendance> getAttendanceForStudent(@PathVariable Long studentId) {
        return attendanceService.getAttendanceForStudent(studentId);
    }

    @PostMapping
    public ResponseEntity<Attendance> markAttendance(@RequestBody Map<String, Object> payload) {
        Long studentId = payload.get("studentId") != null ? Long.valueOf(payload.get("studentId").toString()) : null;
        String status = payload.get("status") != null ? payload.get("status").toString() : null;
        String date = payload.get("date") != null ? payload.get("date").toString() : null; // optional

        if (studentId == null || status == null) {
            return ResponseEntity.badRequest().build();
        }

        Attendance marked = attendanceService.markAttendance(studentId, status, date);
        return ResponseEntity.ok(marked);
    }
}
