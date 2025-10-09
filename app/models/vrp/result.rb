# frozen_string_literal: true
module Vrp
  Result = Data.define(:metrics, :routes, :waypoints) do
    def total_distance_km = metrics&.dig(:total_distance_km)
  end
end

# Back-compat: anywhere still expecting ::Result will accept Vrp::Result
::Result = Vrp::Result unless defined?(::Result)
