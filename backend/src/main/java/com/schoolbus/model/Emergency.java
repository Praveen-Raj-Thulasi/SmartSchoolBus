package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "emergencies")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE emergencies SET is_active = false WHERE emergency_id=?")
@SQLRestriction("is_active = true")
public class Emergency extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "emergency_id")
    private Long emergencyId;

    @Column(name = "trip_id", nullable = false)
    private Long tripId;

    @Column(name = "driver_id", nullable = false)
    private Long driverId;

    @Column(name = "bus_id", nullable = false)
    private Long busId;

    @Column(nullable = false)
    private Double latitude;

    @Column(nullable = false)
    private Double longitude;

    @Column(nullable = false)
    private String reason; // 'Accident', 'Breakdown', 'Medical Emergency', 'Security Threat', 'Other'

    @Column(nullable = false)
    private String status; // 'Open', 'Resolved', 'Cancelled'

    @Column(name = "students_onboard", nullable = false)
    private Integer studentsOnboard;

    @Column(name = "resolved_at")
    private String resolvedAt;

    @Column(name = "resolution_notes", columnDefinition = "TEXT")
    private String resolutionNotes;
}
