user = User.find_or_create_by!(email: "admin@example.com") do |user|
  user.password = "password"
  user.role = "admin"
end

Job.create(problem_type: "VRP", params: { "locations": 10 }, solver: "OR-Tools", seed: 1234, status: "queued", user: user)