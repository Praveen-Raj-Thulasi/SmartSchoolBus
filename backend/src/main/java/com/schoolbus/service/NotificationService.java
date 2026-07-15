package com.schoolbus.service;

import com.schoolbus.model.Notification;
import com.schoolbus.repository.NotificationRepository;
import com.schoolbus.websocket.RealtimeUpdateHandler;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class NotificationService {

    @Autowired
    private RealtimeUpdateHandler updateHandler;

    @Autowired
    private NotificationRepository notificationRepository;

    public List<Notification> getNotificationsForUser(Long userId) {
        return notificationRepository.findByUserIdOrderByTimestampDesc(userId);
    }

    public List<Notification> getAllNotifications() {
        return notificationRepository.findAll();
    }

    public Notification createNotification(Long userId, String message, String type) {
        Notification notification = new Notification();
        notification.setUserId(userId);
        notification.setMessage(message);
        notification.setType(type);
        notification.setTimestamp(Instant.now().toString());
        
        Notification saved = notificationRepository.save(notification);
        updateHandler.sendUpdateNotification("notifications");
        return saved;
    }
}
