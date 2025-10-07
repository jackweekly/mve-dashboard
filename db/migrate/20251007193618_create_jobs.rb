class CreateJobs < ActiveRecord::Migration[8.0]
  def change
    create_table :jobs do |t|
      t.string :problem_type
      t.json :params
      t.string :solver
      t.integer :seed
      t.string :status

      t.timestamps
    end
  end
end
