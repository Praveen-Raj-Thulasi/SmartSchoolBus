package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "leave_requests")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE leave_requests SET is_active = false WHERE leave_id=?")
@SQLRestriction("is_active = true")
public class LeaveRequest extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "leave_id")
    private Long leaveId;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(nullable = false, length = 15)
    private String date; // format: YYYY-MM-DD

    @Column(nullable = false, length = 255)
    private String reason;

    @Column(nullable = false, length = 20)
    private String status = "Approved"; // Approved by default for simplicity in dev

    @Column(name = "trip_type", nullable = false, length = 20)
    private String tripType = "Both"; // Morning, Evening, Both
}
