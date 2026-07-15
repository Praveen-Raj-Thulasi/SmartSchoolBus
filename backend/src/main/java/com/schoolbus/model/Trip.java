package com.schoolbus.model;

import com.schoolbus.model.converter.StringListConverter;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "trips")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE trips SET is_active = false WHERE trip_id=?")
@SQLRestriction("is_active = true")
public class Trip extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "trip_id")
    private Long tripId;

    @Column(name = "route_id", nullable = false)
    private Long routeId;

    @Column(name = "bus_id", nullable = false)
    private Long busId;

    @Column(name = "driver_id", nullable = false)
    private Long driverId;

    @Column(name = "start_time", nullable = false)
    private String startTime;

    @Column(name = "end_time")
    private String endTime;

    @Column(nullable = false)
    private String status; // 'Active', 'Completed', 'Paused'

    @Column(name = "current_stop_index", nullable = false)
    private Integer currentStopIndex = 0;

    @Column(name = "distance_covered", nullable = false)
    private String distanceCovered = "0 km";

    @Column(name = "route_deviated", nullable = false)
    private Boolean routeDeviated = false;

    @Convert(converter = StringListConverter.class)
    @Column(columnDefinition = "TEXT")
    private List<String> logs;
}
