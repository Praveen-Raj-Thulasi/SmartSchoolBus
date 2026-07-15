package com.schoolbus.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "students")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE students SET is_active = false WHERE student_id=?")
@SQLRestriction("is_active = true")
public class Student extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "student_id")
    private Long studentId;

    @Column(nullable = false, length = 100)
    private String name;

    @JsonProperty("class")
    @Column(name = "student_class", nullable = false)
    private String studentClass;

    @Column(nullable = false)
    private String section;

    @Column(name = "parent_id", nullable = false)
    private Long parentId;

    @Column(name = "route_id")
    private Long routeId;

    @Column(name = "bus_id")
    private Long busId;

    @Column(nullable = false, length = 200)
    private String address;

    @Column(length = 100)
    private String email;

    @Column(length = 20)
    private String phone;

    @Column(name = "photo_url", columnDefinition = "LONGTEXT")
    private String photoUrl;

    @jakarta.validation.constraints.Min(value = 1, message = "Seat number must be at least 1")
    @Column(name = "seat_number")
    private Integer seatNumber;
}
