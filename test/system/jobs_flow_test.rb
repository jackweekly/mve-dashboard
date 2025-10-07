require "application_system_test_case"

class JobsFlowTest < ApplicationSystemTestCase
  test "user can queue a job and see it succeed" do
    User.create!(email: "system@example.com", password: "password", role: "admin")

    visit root_path
    click_link "New Job"

    fill_in "Problem type", with: "Vehicle Routing"
    fill_in "Solver", with: "OR-Tools"
    fill_in "Seed", with: "77"
    fill_in "Parameters (JSON)", with: { locations: 4, vehicle_capacity: 12 }.to_json

    click_button "Queue Job"

    assert_text "Job was successfully queued."
    assert_text "Succeeded"
    assert_text "Results"
    assert_text "Solution (JSON)"
    assert_text "Progress: 100%"
  end
end
