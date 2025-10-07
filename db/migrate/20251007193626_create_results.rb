class CreateResults < ActiveRecord::Migration[8.0]
  def change
    create_table :results do |t|
      t.references :job, null: false, foreign_key: true
      t.json :metrics
      t.text :artifacts
      t.float :duration
      t.float :cost

      t.timestamps
    end
  end
end
