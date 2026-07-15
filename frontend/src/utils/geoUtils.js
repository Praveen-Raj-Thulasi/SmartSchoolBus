export const STOP_COORDINATES = {
  "School": [11.0180, 76.9600],
  "Gandhipuram": [11.0183, 76.9644],
  "Peelamedu": [11.0267, 77.0108],
  "Singanallur": [11.0020, 77.0238],
  "Ramanathapuram": [10.9992, 76.9858],
  "Saibaba Colony": [11.0250, 76.9450],
  "RS Puram": [11.0116, 76.9443],
  "Town Hall": [10.9967, 76.9606],
  "Saravanampatti": [11.0772, 77.0003],
  "Default": [11.0168, 76.9558]
};

const geocodeCache = {};
const reverseCache = {};

export function getDeterministicCoord(name) {
  if (!name) return STOP_COORDINATES["School"];
  const normalized = name.trim();
  
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }

  const latOffset = ((Math.abs(hash) % 400) - 200) / 10000;
  const lngOffset = ((Math.abs(hash >> 3) % 600) - 300) / 10000;

  return [11.0168 + latOffset, 76.9558 + lngOffset];
}

export function parseAddress(addressString) {
  if (!addressString) {
    return { name: "", coords: STOP_COORDINATES["School"] };
  }

  const parts = addressString.split('@');
  const name = parts[0].trim();
  
  if (parts.length > 1) {
    const coordParts = parts[1].split(',').map(s => parseFloat(s.trim()));
    if (coordParts.length === 2 && !isNaN(coordParts[0]) && !isNaN(coordParts[1])) {
      return { name, coords: [coordParts[0], coordParts[1]] };
    }
  }

  const matchKey = Object.keys(STOP_COORDINATES).find(
    k => k.toLowerCase() === name.toLowerCase()
  );
  if (matchKey) {
    return { name, coords: STOP_COORDINATES[matchKey] };
  }

  return { name, coords: getDeterministicCoord(name) };
}

export function getCleanAddressName(addressString) {
  if (!addressString) return "";
  return addressString.split('@')[0].trim();
}

export async function geocodeAddress(address) {
  if (!address) return null;
  const cleanName = getCleanAddressName(address);
  if (STOP_COORDINATES[cleanName]) return STOP_COORDINATES[cleanName];

  const query = cleanName.trim();
  if (geocodeCache[query]) return geocodeCache[query];

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
    );
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        geocodeCache[query] = coords;
        return coords;
      }
    }
  } catch (error) {
    console.warn("Geocoding failed for: " + query, error);
  }
  return null;
}

export async function reverseGeocode(lat, lng) {
  const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (reverseCache[cacheKey]) return reverseCache[cacheKey];

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`
    );
    if (response.ok) {
      const data = await response.json();
      if (data && data.display_name) {
        const address = data.address;
        const name = address.road || address.pedestrian || address.suburb || address.neighbourhood || address.city || "Custom Location";
        reverseCache[cacheKey] = name;
        return name;
      }
    }
  } catch (error) {
    console.warn("Reverse geocoding failed", error);
  }
  return "Custom Location";
}

// Haversine distance helper (in km)
function getDistance(c1, c2) {
  const lat1 = c1[0], lon1 = c1[1];
  const lat2 = c2[0], lon2 = c2[1];
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate total route distance for a sequence of coordinates
export function calculateRouteDistance(coords) {
  let distance = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    distance += getDistance(coords[i], coords[i + 1]);
  }
  return distance;
}

// Traveling Salesperson Problem Solver using Genetic Algorithm
export function optimizeRouteGA(stopsArray) {
  if (stopsArray.length <= 3) {
    // Too few stops to run optimization
    const coords = stopsArray.map(stop => parseAddress(stop).coords);
    const dist = calculateRouteDistance(coords);
    return {
      optimizedStops: [...stopsArray],
      originalDistance: parseFloat(dist.toFixed(2)),
      optimizedDistance: parseFloat(dist.toFixed(2)),
      savingsPercent: 0,
      generationsRun: 0
    };
  }

  // Parse stop names and extract coordinates
  const parsedStops = stopsArray.map((stop, index) => ({
    originalIndex: index,
    name: stop,
    coords: parseAddress(stop).coords
  }));

  const startStop = parsedStops[0];
  const restStops = parsedStops.slice(1);
  const N = restStops.length;

  const originalCoords = parsedStops.map(s => s.coords);
  const originalDistance = calculateRouteDistance(originalCoords);

  // GA Parameters
  const POP_SIZE = 50;
  const GENERATIONS = 100;
  const MUTATION_RATE = 0.15;

  // Create initial population (random permutations of indices)
  let population = [];
  for (let i = 0; i < POP_SIZE; i++) {
    const chromosome = [...restStops];
    for (let j = chromosome.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [chromosome[j], chromosome[k]] = [chromosome[k], chromosome[j]];
    }
    population.push(chromosome);
  }

  // Fitness calculation: 1 / total route distance
  function getFitness(chromosome) {
    const fullPathCoords = [startStop.coords, ...chromosome.map(s => s.coords)];
    const dist = calculateRouteDistance(fullPathCoords);
    return 1.0 / (dist + 0.0001);
  }

  // Evolutionary Loop
  for (let g = 0; g < GENERATIONS; g++) {
    const fitnessScores = population.map(chrom => getFitness(chrom));
    
    // Roulette Selection probabilities
    const totalFitness = fitnessScores.reduce((a, b) => a + b, 0);
    const probabilities = fitnessScores.map(score => score / totalFitness);
    
    const selectOne = () => {
      const r = Math.random();
      let sum = 0;
      for (let i = 0; i < POP_SIZE; i++) {
        sum += probabilities[i];
        if (r <= sum) return population[i];
      }
      return population[population.length - 1];
    };

    let nextPopulation = [];

    // Elitism: carry over the best chromosome to next generation
    let bestIndex = 0;
    let bestFit = fitnessScores[0];
    for (let i = 1; i < POP_SIZE; i++) {
      if (fitnessScores[i] > bestFit) {
        bestFit = fitnessScores[i];
        bestIndex = i;
      }
    }
    nextPopulation.push([...population[bestIndex]]);

    // Crossover and Mutation to fill remaining population
    while (nextPopulation.length < POP_SIZE) {
      const parent1 = selectOne();
      const parent2 = selectOne();
      
      // Ordered Crossover (OX) to prevent duplicate stops
      const cut1 = Math.floor(Math.random() * N);
      const cut2 = Math.floor(Math.random() * N);
      const start = Math.min(cut1, cut2);
      const end = Math.max(cut1, cut2);

      const child = Array(N).fill(null);
      for (let i = start; i <= end; i++) {
        child[i] = parent1[i];
      }

      let childIdx = 0;
      for (let i = 0; i < N; i++) {
        const item = parent2[i];
        if (!child.includes(item)) {
          while (child[childIdx] !== null) {
            childIdx++;
          }
          child[childIdx] = item;
        }
      }
      
      // Swap Mutation
      if (Math.random() < MUTATION_RATE) {
        const idx1 = Math.floor(Math.random() * N);
        const idx2 = Math.floor(Math.random() * N);
        [child[idx1], child[idx2]] = [child[idx2], child[idx1]];
      }

      nextPopulation.push(child);
    }

    population = nextPopulation;
  }

  // Find best route in final population
  const fitnessScores = population.map(chrom => getFitness(chrom));
  let bestIndex = 0;
  let bestFit = fitnessScores[0];
  for (let i = 1; i < POP_SIZE; i++) {
    if (fitnessScores[i] > bestFit) {
      bestFit = fitnessScores[i];
      bestIndex = i;
    }
  }

  const bestChromosome = population[bestIndex];
  const optimizedStops = [startStop.name, ...bestChromosome.map(s => s.name)];
  const optimizedCoords = [startStop.coords, ...bestChromosome.map(s => s.coords)];
  const optimizedDistance = calculateRouteDistance(optimizedCoords);

  const savings = originalDistance - optimizedDistance;
  const savingsPercent = originalDistance > 0 ? Math.round((savings / originalDistance) * 100) : 0;

  return {
    optimizedStops,
    originalDistance: parseFloat(originalDistance.toFixed(2)),
    optimizedDistance: parseFloat(optimizedDistance.toFixed(2)),
    savingsPercent: Math.max(0, savingsPercent),
    generationsRun: GENERATIONS
  };
}
