package com.schoolbus.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "face_embeddings")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE face_embeddings SET is_active = false WHERE embedding_id=?")
@SQLRestriction("is_active = true")
public class FaceEmbedding extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "embedding_id")
    private Long embeddingId;

    @Column(name = "student_id", nullable = false, unique = true)
    private Long studentId;

    @Column(name = "embedding_data", columnDefinition = "TEXT", nullable = false)
    private String embeddingData;
}
