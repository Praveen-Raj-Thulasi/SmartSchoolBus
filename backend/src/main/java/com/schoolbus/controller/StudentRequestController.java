package com.schoolbus.controller;

import com.schoolbus.model.StudentRequest;
import com.schoolbus.service.StudentRequestService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/student-requests")
public class StudentRequestController {

    @Autowired
    private StudentRequestService studentRequestService;

    @GetMapping
    public List<StudentRequest> getAllRequests() {
        return studentRequestService.getAllRequests();
    }

    @GetMapping("/parent/{parentId}")
    public List<StudentRequest> getRequestsByParentId(@PathVariable Long parentId) {
        return studentRequestService.getRequestsByParentId(parentId);
    }

    @PostMapping
    public ResponseEntity<?> createRequest(@RequestBody StudentRequest request) {
        try {
            StudentRequest created = studentRequestService.createRequest(request);
            return ResponseEntity.ok(created);
        } catch (IllegalArgumentException e) {
            java.util.Map<String, String> response = new java.util.HashMap<>();
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<StudentRequest> approveRequest(@PathVariable Long id) {
        return studentRequestService.approveRequest(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<StudentRequest> rejectRequest(@PathVariable Long id) {
        return studentRequestService.rejectRequest(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
