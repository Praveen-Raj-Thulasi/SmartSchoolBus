package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "buses")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE buses SET is_active = false WHERE bus_id=?")
@SQLRestriction("is_active = true")
public class Bus extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "bus_id")
    private Long busId;

    @Column(name = "bus_number", nullable = false, unique = true)
    private String busNumber;

    @Column(nullable = false)
    private Integer capacity;

    @Column(name = "driver_id")
    private Long driverId;

    @Column(name = "current_status")
    private String currentStatus = "Idle";

    @Column(name = "maintenance_status")
    private String maintenanceStatus = "Good";
}
