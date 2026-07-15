package com.schoolbus.controller;

import com.schoolbus.model.LeaveRequest;
import com.schoolbus.repository.LeaveRequestRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/leaves")
public class LeaveRequestController {

    @Autowired
    private LeaveRequestRepository leaveRequestRepository;

    @Autowired
    private com.schoolbus.repository.AttendanceRepository attendanceRepository;

    @GetMapping
    public List<LeaveRequest> getAllLeaves() {
        return leaveRequestRepository.findAll();
    }

    @PostMapping
    public ResponseEntity<?> submitLeave(@RequestBody LeaveRequest leaveRequest) {
        if (leaveRequest.getStudentId() == null || leaveRequest.getDate() == null || leaveRequest.getReason() == null) {
            return ResponseEntity.badRequest().build();
        }

        // 1. Past dates check
        if (leaveRequest.getDate().compareTo(java.time.LocalDate.now().toString()) < 0) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", "Cannot submit leave request for past dates."));
        }

        // 2. Duplicate leave check
        List<LeaveRequest> existingLeaves = leaveRequestRepository.findByDate(leaveRequest.getDate());
        boolean hasDuplicate = existingLeaves.stream()
            .anyMatch(lr -> lr.getStudentId().equals(leaveRequest.getStudentId()) 
                && ("Both".equalsIgnoreCase(lr.getTripType()) 
                    || "Both".equalsIgnoreCase(leaveRequest.getTripType())
                    || lr.getTripType().equalsIgnoreCase(leaveRequest.getTripType())));
        if (hasDuplicate) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", "Duplicate leave request for the same student on this date."));
        }

        // 3. Boarded today check
        List<com.schoolbus.model.Attendance> attendanceRecords = attendanceRepository.findByStudentId(leaveRequest.getStudentId());
        boolean alreadyBoardedToday = attendanceRecords.stream()
            .anyMatch(a -> leaveRequest.getDate().equals(a.getDate()) && "Boarded".equalsIgnoreCase(a.getStatus()));
        if (alreadyBoardedToday) {
            return ResponseEntity.badRequest().body(java.util.Map.of("message", "Student has already boarded the bus today. Cannot submit leave request."));
        }

        LeaveRequest saved = leaveRequestRepository.save(leaveRequest);
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> cancelLeave(@PathVariable Long id) {
        if (!leaveRequestRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        leaveRequestRepository.deleteById(id);
        return ResponseEntity.ok().build();
    }
}
