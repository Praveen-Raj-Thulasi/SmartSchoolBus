package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "route_optimizations")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE route_optimizations SET is_active = false WHERE optimization_id=?")
@SQLRestriction("is_active = true")
public class RouteOptimization extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "optimization_id")
    private Long optimizationId;

    @Column(name = "route_id", nullable = false)
    private Long routeId;

    @Column(name = "school_address", nullable = false)
    private String schoolAddress;

    @Column(name = "student_pickup_locations", columnDefinition = "TEXT", nullable = false)
    private String studentPickupLocations;

    @Column(name = "bus_capacity", nullable = false)
    private Integer busCapacity;

    @Column(name = "number_of_students", nullable = false)
    private Integer numberOfStudents;

    @Column(name = "bus_assigned", nullable = false)
    private String busAssigned;

    @Column(name = "traffic_level", nullable = false)
    private String trafficLevel;

    @Column(name = "road_closures", columnDefinition = "TEXT")
    private String roadClosures;

    @Column(name = "suggested_route", columnDefinition = "TEXT", nullable = false)
    private String suggestedRoute;

    @Column(name = "stops_order", columnDefinition = "TEXT", nullable = false)
    private String stopsOrder;

    @Column(name = "total_distance", nullable = false)
    private Double totalDistance;

    @Column(name = "estimated_time", nullable = false)
    private Double estimatedTime;

    @Column(name = "fuel_efficiency", nullable = false)
    private Double fuelEfficiency;

    @Column(name = "bus_utilization", nullable = false)
    private Double busUtilization;

    @Column(name = "algorithm_used", nullable = false)
    private String algorithmUsed;
}
