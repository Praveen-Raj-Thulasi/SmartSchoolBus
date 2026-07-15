package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "grievances")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE grievances SET is_active = false WHERE grievance_id=?")
@SQLRestriction("is_active = true")
public class Grievance extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "grievance_id")
    private Long grievanceId;

    @Column(name = "parent_id", nullable = false)
    private Long parentId;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(nullable = false, length = 100)
    private String category;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, length = 50)
    private String status = "Pending"; // Pending, In Progress, Resolved

    @Column(name = "resolution_notes", columnDefinition = "TEXT")
    private String resolutionNotes;
}
