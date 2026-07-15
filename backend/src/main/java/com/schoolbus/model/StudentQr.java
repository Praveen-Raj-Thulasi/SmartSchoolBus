package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "student_qrs")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE student_qrs SET is_active = false WHERE qr_id=?")
@SQLRestriction("is_active = true")
public class StudentQr extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "qr_id")
    private Long qrId;

    @Column(name = "student_id", nullable = false, unique = true)
    private Long studentId;

    @Column(name = "qr_code_token", nullable = false, unique = true)
    private String qrCodeToken;
}
