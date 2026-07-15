package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "users")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE users SET is_active = false WHERE user_id=?")
@SQLRestriction("is_active = true")
public class User extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false, unique = true, length = 100)
    private String username;

    @Column(nullable = false, length = 200)
    private String password;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "driver_id")
    private Long driverId;

    @Column(name = "parent_id")
    private Long parentId;

    @Column(name = "student_id")
    private Long studentId;
}
