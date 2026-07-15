package com.schoolbus.controller;

import com.schoolbus.model.Notification;
import com.schoolbus.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    @Autowired
    private NotificationService notificationService;

    @GetMapping
    public List<Notification> getAllNotifications() {
        return notificationService.getAllNotifications();
    }

    @GetMapping("/user/{userId}")
    public List<Notification> getNotificationsForUser(@PathVariable Long userId) {
        return notificationService.getNotificationsForUser(userId);
    }

    @PostMapping
    public ResponseEntity<Notification> createNotification(@RequestBody Map<String, Object> payload) {
        Long userId = payload.get("userId") != null ? Long.valueOf(payload.get("userId").toString()) : null;
        String message = payload.get("message") != null ? payload.get("message").toString() : null;
        String type = payload.get("type") != null ? payload.get("type").toString() : null;

        if (userId == null || message == null || type == null) {
            return ResponseEntity.badRequest().build();
        }

        Notification notification = notificationService.createNotification(userId, message, type);
        return ResponseEntity.ok(notification);
    }
}
