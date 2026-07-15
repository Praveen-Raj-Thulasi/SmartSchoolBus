package com.schoolbus.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "student_requests")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
public class StudentRequest extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "request_id")
    private Long requestId;

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

    @Column(nullable = false, length = 50)
    private String status = "PENDING"; // PENDING, APPROVED, REJECTED
}
