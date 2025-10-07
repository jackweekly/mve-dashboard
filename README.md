# Sparrow Ops

This is a Ruby on Rails application for managing and running optimization jobs.

## Prerequisites

- Ruby
- Rails
- PostgreSQL
- Redis

## Setup

1.  Clone the repository.
2.  Install the dependencies:

    ```
    bundle install
    ```

3.  Create the database:

    ```
    rails db:create
    ```

4.  Run the migrations:

    ```
    rails db:migrate
    ```

5.  Set up the environment variables. Copy the `.env.example` file to `.env` and fill in the values.

## Running the application

1.  Start the Rails server:

    ```
    rails server
    ```

2.  Start the Sidekiq workers:

    ```
    sidekiq
    ```

3.  Start the Python service (stub):

    ```
    cd ../python-service
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000
    ```

## Cloud deployment

The repository ships with `docker-compose.cloud.yml` and an accompanying
`.env.cloud.example` so you can boot the full stack (web, Sidekiq, PostgreSQL,
Redis) on any cloud VM that has Docker installed. See `docs/cloud_deploy.md`
for a step-by-step guide covering host preparation, environment variables,
initial migrations, and day-two operations.

## API Contract

### Create Job

-   **Endpoint:** `/jobs`
-   **Method:** `POST`
-   **Payload:**

    ```json
    {
      "problem_type": "<string>",
      "params": {},
      "solver": "<string>",
      "seed": "<integer>"
    }
    ```

### Get Job Status

-   **Endpoint:** `/jobs/<job_id>`
-   **Method:** `GET`
-   **Response:**

    ```json
    {
      "id": "<integer>",
      "status": "<string>",
      "progress": "<float>",
      "logs": "<string>"
    }
    ```

### Get Job Results

-   **Endpoint:** `/jobs/<job_id>/results`
-   **Method:** `GET`
-   **Response:**

    ```json
    {
      "metrics": {},
      "artifacts": [
        {
          "name": "<string>",
          "url": "<string>"
        }
      ]
    }
    ```
