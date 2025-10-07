require "test_helper"

class JobsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email: "tester@example.com", password: "password", role: "admin")
  end

  test "should get index" do
    get jobs_url
    assert_response :success
  end

  test "should get new" do
    get new_job_url
    assert_response :success
  end

  test "creates a job and enqueues worker" do
    assert_difference("Job.count") do
      post jobs_url, params: {
        job: {
          problem_type: "Vehicle Routing",
          solver: "OR-Tools",
          seed: 123,
          params_json: { locations: 5 }.to_json
        }
      }
    end

    job = Job.order(:created_at).last
    assert_redirected_to job_url(job)
    follow_redirect!
    assert_response :success
    assert_match(/succeeded/i, response.body)
  end

  test "shows a job" do
    job = @user.jobs.create!(problem_type: "Routing", solver: "OR-Tools", seed: 1, params: { locations: 5 })
    get job_url(job)
    assert_response :success
    assert_select "h1", text: job.problem_type
  end
end
