// Import and register all your controllers from the importmap via controllers/**/*_controller
import { application } from "./application"
import JobSubmissionController from "./job_submission_controller"
application.register("job-submission", JobSubmissionController)
