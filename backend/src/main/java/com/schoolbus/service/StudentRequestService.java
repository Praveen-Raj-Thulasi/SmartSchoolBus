package com.schoolbus.service;

import com.schoolbus.model.Student;
import com.schoolbus.model.StudentRequest;
import com.schoolbus.repository.StudentRequestRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class StudentRequestService {

    @Autowired
    private StudentRequestRepository studentRequestRepository;

    @Autowired
    private StudentService studentService;

    public List<StudentRequest> getAllRequests() {
        return studentRequestRepository.findAll();
    }

    public List<StudentRequest> getRequestsByParentId(Long parentId) {
        return studentRequestRepository.findByParentId(parentId);
    }

    public Optional<StudentRequest> getRequestById(Long requestId) {
        return studentRequestRepository.findById(requestId);
    }

    public StudentRequest createRequest(StudentRequest request) {
        // 1. Pending Request Limit Check (max 3 PENDING requests)
        List<StudentRequest> existing = studentRequestRepository.findByParentId(request.getParentId());
        long pendingCount = existing.stream()
                .filter(r -> "PENDING".equals(r.getStatus()))
                .count();
        if (pendingCount >= 3) {
            throw new IllegalArgumentException("You cannot have more than 3 pending enrollment requests at a time.");
        }

        // 2. Duplicate Check against Pending Requests
        boolean isDuplicateRequest = existing.stream()
                .filter(r -> "PENDING".equals(r.getStatus()))
                .anyMatch(r -> r.getName().equalsIgnoreCase(request.getName()) 
                        && r.getStudentClass().equalsIgnoreCase(request.getStudentClass())
                        && r.getSection().equalsIgnoreCase(request.getSection()));
        if (isDuplicateRequest) {
            throw new IllegalArgumentException("A pending request for a student with the same name, class, and section already exists.");
        }

        // 3. Duplicate Check against Active Students
        List<Student> activeStudents = studentService.getStudentsByParentId(request.getParentId());
        boolean isAlreadyActive = activeStudents.stream()
                .anyMatch(s -> s.getName().equalsIgnoreCase(request.getName()));
        if (isAlreadyActive) {
            throw new IllegalArgumentException("A student with this name is already registered to your account.");
        }

        request.setStatus("PENDING");
        return studentRequestRepository.save(request);
    }

    @Transactional
    public Optional<StudentRequest> approveRequest(Long requestId) {
        Optional<StudentRequest> requestOpt = studentRequestRepository.findById(requestId);
        if (requestOpt.isPresent()) {
            StudentRequest request = requestOpt.get();
            if ("PENDING".equals(request.getStatus())) {
                request.setStatus("APPROVED");
                studentRequestRepository.save(request);

                // Create and save new Student entity
                Student student = new Student();
                student.setName(request.getName());
                student.setStudentClass(request.getStudentClass());
                student.setSection(request.getSection());
                student.setParentId(request.getParentId());
                student.setRouteId(request.getRouteId());
                student.setBusId(request.getBusId());
                student.setAddress(request.getAddress());
                student.setEmail(request.getEmail());
                student.setPhone(request.getPhone());
                studentService.addStudent(student);
            }
            return Optional.of(request);
        }
        return Optional.empty();
    }

    @Transactional
    public Optional<StudentRequest> rejectRequest(Long requestId) {
        Optional<StudentRequest> requestOpt = studentRequestRepository.findById(requestId);
        if (requestOpt.isPresent()) {
            StudentRequest request = requestOpt.get();
            if ("PENDING".equals(request.getStatus())) {
                request.setStatus("REJECTED");
                studentRequestRepository.save(request);
            }
            return Optional.of(request);
        }
        return Optional.empty();
    }
}
