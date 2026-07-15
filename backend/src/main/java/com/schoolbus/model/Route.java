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
@Table(name = "routes")
@Data
@lombok.EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@SQLDelete(sql = "UPDATE routes SET is_active = false WHERE route_id=?")
@SQLRestriction("is_active = true")
public class Route extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "route_id")
    private Long routeId;

    @Column(name = "route_name", nullable = false, length = 100)
    private String routeName;

    @Column(nullable = false)
    private String distance;

    @Column(name = "estimated_time", nullable = false)
    private String estimatedTime;

    @Convert(converter = StringListConverter.class)
    @Column(columnDefinition = "TEXT")
    private List<String> stops;
}
