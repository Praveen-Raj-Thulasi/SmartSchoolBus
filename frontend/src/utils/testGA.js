import { optimizeRouteGA } from './geoUtils.js';

const testStops = [
  "School @ 37.4275, -122.1697",
  "Cedar Lane @ 37.4480, -122.1420",
  "Oak Street @ 37.4320, -122.1620",
  "Willow Way @ 37.4050, -122.1900",
  "Pine Road @ 37.4420, -122.1500"
];

console.log("=========================================");
console.log("   AI ROUTE OPTIMIZATION CHECKING TOOL   ");
console.log("=========================================");
console.log("\nOriginal Sequence of Stops:");
testStops.forEach((stop, i) => {
  console.log(`  [Stop ${i}] ${stop}`);
});

const result = optimizeRouteGA(testStops);

console.log("\nOptimized Sequence of Stops (Solved via Genetic Algorithm):");
result.optimizedStops.forEach((stop, i) => {
  console.log(`  [Stop ${i}] ${stop}`);
});

console.log("\n=========================================");
console.log("           OPTIMIZATION METRICS          ");
console.log("=========================================");
console.log(`• Original Distance  : ${result.originalDistance} km`);
console.log(`• Optimized Distance : ${result.optimizedDistance} km`);
console.log(`• Path Efficiency    : ${result.savingsPercent}% Shorter Route!`);
console.log(`• Genetic Populations: ${result.generationsRun} generations`);
console.log("=========================================");
