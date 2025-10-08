# Be sure to restart your server when you modify this file.

# Define an application-wide content security policy.
# See the Securing Rails Applications Guide for more information:
# https://guides.rubyonrails.org/security.html#content-security-policy-header

Rails.application.config.content_security_policy do |p|
  mapbox_hosts = %w[
    https://api.mapbox.com
    https://events.mapbox.com
    https://*.tiles.mapbox.com
  ]

  p.default_src :none
  p.base_uri    :self
  p.script_src  :self, :https, *mapbox_hosts, :unsafe_inline
  p.style_src   :self, :https, *mapbox_hosts, :unsafe_inline
  p.img_src     :self, :https, :data, *mapbox_hosts
  p.font_src    :self, :https, :data, 'https://api.mapbox.com'
  p.connect_src :self, :https, *mapbox_hosts
  p.worker_src  :self, :blob
  p.frame_ancestors :none
  p.form_action :self
  p.block_all_mixed_content
  p.upgrade_insecure_requests
end
