package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "driver_ratings")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE driver_ratings SET is_active = false WHERE rating_id=?")
@SQLRestriction("is_active = true")
public class DriverRating extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "rating_id")
    private Long ratingId;

    @Column(name = "parent_id", nullable = false)
    private Long parentId;

    @Column(name = "driver_id", nullable = false)
    private Long driverId;

    @Column(name = "trip_id", nullable = false)
    private Long tripId;

    @Column(nullable = false)
    private Integer stars; // 1 to 5

    @Column(columnDefinition = "TEXT")
    private String comments;
}
