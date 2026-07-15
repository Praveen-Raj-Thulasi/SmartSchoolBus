package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "attendance_events")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE attendance_events SET is_active = false WHERE event_id=?")
@SQLRestriction("is_active = true")
public class AttendanceEvent extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventId;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(nullable = false)
    private String type; // 'QR', 'FACE', 'MANUAL'

    private Double confidence;

    @Column(name = "scanned_at", nullable = false)
    private String scannedAt;

    @Column(nullable = false)
    private String status; // 'Boarded', 'Dropped'
}
