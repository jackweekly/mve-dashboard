from flask import Flask, request, jsonify
import numpy as np
import random
import math

app = Flask(__name__)

def calculate_distance(point1, point2):
    return math.sqrt((point1[0] - point2[0])**2 + (point1[1] - point2[1])**2)

def total_route_distance(route, locations):
    distance = 0
    if not route:
        return 0
    for i in range(len(route) - 1):
        distance += calculate_distance(locations[route[i]], locations[route[i+1]])
    return distance

# --- Simulated Annealing ---
def simulated_annealing(locations, initial_route, temperature, cooling_rate, iterations):
    current_route = list(initial_route)
    best_route = list(current_route)
    current_distance = total_route_distance(current_route, locations)
    best_distance = current_distance

    if len(current_route) <= 2: # Cannot swap if route has 0 or 1 customer (depot-customer-depot)
        return best_route, best_distance

    for i in range(iterations):
        # Generate a neighbor by swapping two random cities (excluding depot at start/end)
        # Ensure we have at least two customer locations to swap
        customer_indices = [idx for idx, loc_idx in enumerate(current_route) if loc_idx != current_route[0] and loc_idx != current_route[-1]]
        if len(customer_indices) < 2:
            break # No valid customers to swap

        idx1_in_customers = random.choice(customer_indices)
        idx2_in_customers = random.choice(customer_indices)
        while idx1_in_customers == idx2_in_customers:
            idx2_in_customers = random.choice(customer_indices)
        
        # Find actual indices in the current_route list
        actual_idx1 = current_route.index(idx1_in_customers)
        actual_idx2 = current_route.index(idx2_in_customers)

        new_route = list(current_route)
        new_route[actual_idx1], new_route[actual_idx2] = new_route[actual_idx2], new_route[actual_idx1]

        new_distance = total_route_distance(new_route, locations)

        if new_distance < current_distance or random.random() < math.exp((current_distance - new_distance) / temperature):
            current_route = new_route
            current_distance = new_distance

        if current_distance < best_distance:
            best_route = current_route
            best_distance = current_distance

        temperature *= cooling_rate

    return best_route, best_distance

# --- Tabu Search ---
def tabu_search(locations, initial_route, tabu_list_size, iterations):
    current_route = list(initial_route)
    best_route = list(current_route)
    best_distance = total_route_distance(current_route, locations)
    tabu_list = []

    if len(current_route) <= 2: # Cannot swap if route has 0 or 1 customer (depot-customer-depot)
        return best_route, best_distance

    for i in range(iterations):
        best_neighbor = None
        best_neighbor_distance = float('inf')
        best_move = None

        customer_indices_in_route = [idx for idx, loc_idx in enumerate(current_route) if loc_idx != current_route[0] and loc_idx != current_route[-1]]
        if len(customer_indices_in_route) < 2:
            break # No valid customers to swap

        for i_idx in range(len(customer_indices_in_route)):
            for j_idx in range(i_idx + 1, len(customer_indices_in_route)):
                idx1 = customer_indices_in_route[i_idx]
                idx2 = customer_indices_in_route[j_idx]

                neighbor_route = list(current_route)
                # Swap the actual location indices in the route
                pos1 = current_route.index(idx1)
                pos2 = current_route.index(idx2)
                neighbor_route[pos1], neighbor_route[pos2] = neighbor_route[pos2], neighbor_route[pos1]

                move = tuple(sorted((idx1, idx2))) # Store the actual location indices swapped

                if move not in tabu_list:
                    neighbor_distance = total_route_distance(neighbor_route, locations)
                    if neighbor_distance < best_neighbor_distance:
                        best_neighbor = neighbor_route
                        best_neighbor_distance = neighbor_distance
                        best_move = move
        
        if best_neighbor:
            current_route = best_neighbor
            current_distance = best_neighbor_distance

            if current_distance < best_distance:
                best_route = current_route
                best_distance = current_distance
            
            # Add move to tabu list
            tabu_list.append(best_move)
            if len(tabu_list) > tabu_list_size:
                tabu_list.pop(0)
        else:
            break # No non-tabu neighbors found

    return best_route, best_distance

# --- Ant Colony Optimization ---
def ant_colony_optimization(locations, num_ants, num_iterations, decay, alpha, beta, depot_index=0):
    num_locations = len(locations)
    pheromone = np.ones((num_locations, num_locations))
    best_route = None
    best_distance = float('inf')

    customer_indices = [i for i in range(num_locations) if i != depot_index]

    for iteration in range(num_iterations):
        all_routes = []
        all_distances = []

        for ant in range(num_ants):
            visited = [False] * num_locations
            current_location_idx = depot_index # Start from depot
            route = [current_location_idx]
            visited[current_location_idx] = True

            # Build route for current ant
            while len(route) < num_locations:
                unvisited_customers = [i for i in customer_indices if not visited[i]]
                
                if not unvisited_customers: # All customers visited
                    break

                probabilities = []
                for next_location_idx in unvisited_customers:
                    dist = calculate_distance(locations[current_location_idx], locations[next_location_idx])
                    if dist == 0: # Avoid division by zero
                        prob = (pheromone[current_location_idx, next_location_idx]**alpha) * ((1/0.0001)**beta)
                    else:
                        prob = (pheromone[current_location_idx, next_location_idx]**alpha) * ((1/dist)**beta)
                    probabilities.append((next_location_idx, prob))
                
                total_prob = sum([p for _, p in probabilities])
                if total_prob == 0:
                    next_location_idx = random.choice(unvisited_customers)
                else:
                    pick = random.uniform(0, total_prob)
                    current = 0
                    for next_loc, prob in probabilities:
                        current += prob
                        if current >= pick:
                            next_location_idx = next_loc
                            break

                route.append(next_location_idx)
                visited[next_location_idx] = True
                current_location_idx = next_location_idx
            
            route.append(depot_index) # Return to depot
            all_routes.append(route)
            all_distances.append(total_route_distance(route, locations))
        
        # Update pheromones
        pheromone *= (1 - decay)
        for r_idx, route in enumerate(all_routes):
            for i in range(len(route) - 1):
                pheromone[route[i], route[i+1]] += 1 / all_distances[r_idx]
        
        # Find best route in this iteration
        min_distance_idx = np.argmin(all_distances)
        if all_distances[min_distance_idx] < best_distance:
            best_distance = all_distances[min_distance_idx]
            best_route = all_routes[min_distance_idx]

    return best_route, best_distance


def solve_vrp_problem(locations, num_vehicles, depot_index=0):
    if not locations or len(locations) < 2:
        return [], 0

    # Separate depot from customer locations
    depot_location = locations[depot_index]
    customer_locations_indices = [i for i in range(len(locations)) if i != depot_index]
    
    # Simple assignment: distribute customers among vehicles
    # This is a very basic approach and doesn't consider capacities or demands yet.
    vehicle_routes_indices = [[] for _ in range(num_vehicles)]
    for i, customer_idx in enumerate(customer_locations_indices):
        vehicle_routes_indices[i % num_vehicles].append(customer_idx)

    final_routes_coords = []
    total_overall_distance = 0

    for route_indices in vehicle_routes_indices:
        if not route_indices:
            continue

        # Prepend and append depot to each vehicle's route
        current_vehicle_full_route_indices = [depot_index] + route_indices + [depot_index]

        # Apply Simulated Annealing
        sa_route, sa_distance = simulated_annealing(
            locations,
            current_vehicle_full_route_indices,
            temperature=10000,
            cooling_rate=0.99,
            iterations=1000
        )

        # Apply Tabu Search starting from SA result
        ts_route, ts_distance = tabu_search(
            locations,
            sa_route,
            tabu_list_size=10,
            iterations=500
        )

        # Apply Ant Colony Optimization (can be run independently or refined with previous results)
        aco_route, aco_distance = ant_colony_optimization(
            locations,
            num_ants=10,
            num_iterations=100,
            decay=0.1,
            alpha=1,
            beta=2,
            depot_index=depot_index
        )

        # Compare results and pick the best one for this vehicle's route
        if sa_distance <= ts_distance and sa_distance <= aco_distance:
            best_route_for_vehicle_indices = sa_route
            best_distance_for_vehicle = sa_distance
        elif ts_distance <= sa_distance and ts_distance <= aco_distance:
            best_route_for_vehicle_indices = ts_route
            best_distance_for_vehicle = ts_distance
        else:
            best_route_for_vehicle_indices = aco_route
            best_distance_for_vehicle = aco_distance

        # Convert route indices back to actual coordinates
        route_coords = [locations[i] for i in best_route_for_vehicle_indices]
        final_routes_coords.append(route_coords)
        total_overall_distance += best_distance_for_vehicle

    return final_routes_coords, total_overall_distance


@app.route('/solve_vrp', methods=['POST'])
def solve_vrp_endpoint():
    data = request.json
    locations_data = data.get('vrp', {}).get('locations', [])
    num_vehicles = data.get('vrp', {}).get('num_vehicles', 1) # Default to 1 vehicle
    depot_index = data.get('vrp', {}).get('depot_index', 0) # Default depot is the first location

    if not locations_data or len(locations_data) < 2:
        return jsonify({'status': 'error', 'message': 'At least two locations are required.'}), 400

    try:
        routes, total_distance = solve_vrp_problem(locations_data, num_vehicles, depot_index)
        return jsonify({
            'status': 'success',
            'routes': routes,
            'total_distance': total_distance,
            'message': 'VRP solved successfully.'
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
