package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "attendance")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE attendance SET is_active = false WHERE attendance_id=?")
@SQLRestriction("is_active = true")
public class Attendance extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "attendance_id")
    private Long attendanceId;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(nullable = false, length = 20)
    private String date;

    @Column(nullable = false)
    private String status;

    @Column(nullable = false, length = 10)
    private String time;
}
