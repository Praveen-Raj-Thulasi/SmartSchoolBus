package com.schoolbus.controller;

import com.schoolbus.model.User;
import com.schoolbus.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserService userService;

    @Autowired
    private com.schoolbus.service.DriverService driverService;

    @Autowired
    private com.schoolbus.service.ParentService parentService;

    @Autowired
    private com.schoolbus.service.StudentService studentService;

    @GetMapping
    public List<User> getAllUsers() {
        return userService.getAllUsers();
    }

    @DeleteMapping("/me")
    public ResponseEntity<?> deleteMe(java.security.Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(401).body(Map.of("message", "Unauthorized"));
        }
        String username = principal.getName();
        Optional<User> userOpt = userService.getUserByUsername(username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            String role = user.getRole();
            if ("driver".equalsIgnoreCase(role)) {
                if (user.getDriverId() != null) {
                    driverService.deleteDriver(user.getDriverId());
                }
            } else if ("parent".equalsIgnoreCase(role)) {
                if (user.getParentId() != null) {
                    parentService.deleteParent(user.getParentId());
                }
            } else if ("student".equalsIgnoreCase(role)) {
                if (user.getStudentId() != null) {
                    studentService.deleteStudent(user.getStudentId());
                }
            } else {
                return ResponseEntity.badRequest().body(Map.of("message", "Administrators cannot self-delete."));
            }
            return ResponseEntity.ok().body(Map.of("success", true, "message", "Account deleted successfully"));
        }
        return ResponseEntity.status(404).body(Map.of("message", "User not found"));
    }
}
