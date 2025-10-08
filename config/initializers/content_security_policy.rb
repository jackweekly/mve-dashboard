# Be sure to restart your server when you modify this file.

# Define an application-wide content security policy.
# See the Securing Rails Applications Guide for more information:
# https://guides.rubyonrails.org/security.html#content-security-policy-header

Rails.application.config.content_security_policy do |p|
  p.default_src :none
  p.base_uri    :self
  p.script_src  :self, :https
  p.style_src   :self, :https
  p.img_src     :self, :https, :data
  p.font_src    :self, :https, :data
  p.connect_src :self, :https
  p.frame_ancestors :none
  p.form_action :self
  p.block_all_mixed_content
  p.upgrade_insecure_requests
end
Rails.application.config.content_security_policy_nonce_generator = -> req { SecureRandom.base64(16) }
