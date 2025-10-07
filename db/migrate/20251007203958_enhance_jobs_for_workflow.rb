class EnhanceJobsForWorkflow < ActiveRecord::Migration[8.0]
  def up
    add_column :jobs, :progress, :integer, default: 0, null: false
    add_column :jobs, :external_id, :string
    add_column :jobs, :status_tmp, :integer, default: 0, null: false

    execute <<~SQL
      UPDATE jobs
      SET status_tmp = CASE status
        WHEN 'running' THEN 1
        WHEN 'succeeded' THEN 2
        WHEN 'failed' THEN 3
        ELSE 0
      END
    SQL

    remove_column :jobs, :status, :string
    rename_column :jobs, :status_tmp, :status

    add_index :jobs, :status
    add_index :jobs, :external_id
  end

  def down
    remove_index :jobs, :external_id
    remove_index :jobs, :status

    add_column :jobs, :status_tmp, :string, default: 'queued', null: false

    execute <<~SQL
      UPDATE jobs
      SET status_tmp = CASE status
        WHEN 1 THEN 'running'
        WHEN 2 THEN 'succeeded'
        WHEN 3 THEN 'failed'
        ELSE 'queued'
      END
    SQL

    remove_column :jobs, :status, :integer
    rename_column :jobs, :status_tmp, :status

    remove_column :jobs, :progress
    remove_column :jobs, :external_id
  end
end
