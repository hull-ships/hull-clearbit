import mapper from 'object-mapper'

const mapping = {
  "id":                   "traits.cb_id",
  "name.fullName":          "props.full_name", 
  "name.givenName":       "traits.cb_given_name", 
  "name.familyName":        "props.last_name", 
  "email":                  "props.contact_email", 
  "gender":                 "props.gender", 
  "location":             "traits.cb_location", 
  "utcOffset":            "traits.cb_utcOffset", 
  "geo.city":               "props.address.city", 
  "geo.state":              "props.address.state", 
  "geo.stateCode":        "traits.cb_stateCode", 
  "geo.country":            "props.address.country", 
  "geo.countryCode":      "traits.cb_countryCode", 
  "geo.lat":              "traits.cb_lat", 
  "geo.lng":              "traits.cb_lng", 
  "bio":                    "props.description", 
  "site":                 "traits.cb_site", 
  "avatar":                 "props.picture", 
  "employment.domain":    "traits.cb_employment_domain", 
  "employment.name":      "traits.cb_employment_name", 
  "employment.title":     "traits.cb_employment_title", 
  "employment.role":      "traits.cb_employment_role", 
  "employment.seniority": "traits.cb_employment_seniority", 
  "facebook.handle":      "traits.cb_facebook_handle", 
  "github.handle":        "traits.cb_github_handle", 
  "github.avatar":        "traits.cb_github_avatar", 
  "github.company":       "traits.cb_github_company", 
  "github.blog":          "traits.cb_github_blog", 
  "github.followers":     "traits.cb_github_followers", 
  "github.following":     "traits.cb_github_following", 
  "twitter.handle":       "traits.cb_twitter_handle", 
  "twitter.id":           "traits.cb_twitter_id", 
  "twitter.bio":          "traits.cb_twitter_bio", 
  "twitter.followers":    "traits.cb_twitter_followers", 
  "twitter.following":    "traits.cb_twitter_following", 
  "twitter.location":     "traits.cb_twitter_location", 
  "twitter.site":         "traits.cb_twitter_site", 
  "twitter.avatar":       "traits.cb_twitter_avatar", 
  "linkedin.handle":      "traits.cb_linkedin_handle", 
  "googleplus.handle":    "traits.cb_googleplus_handle", 
  "angellist.handle":     "traits.cb_angellist_handle", 
  "angellist.bio":        "traits.cb_angellist_bio", 
  "angellist.blog":       "traits.cb_angellist_blog", 
  "angellist.site":       "traits.cb_angellist_site", 
  "angellist.followers":  "traits.cb_angellist_followers", 
  "angellist.avatar":     "traits.cb_angellist_avatar", 
  "aboutme.handle":       "traits.cb_aboutme_handle", 
  "aboutme.bio":          "traits.cb_aboutme_bio", 
  "aboutme.avatar":       "traits.cb_aboutme_avatar", 
  "gravatar.handle":      "traits.cb_gravatar_handle", 
  "gravatar.avatar":      "traits.cb_gravatar_avatar", 
  //"gravatar.urls[]":
  //"gravatar.avatars[]":
}

export default function(source){
  return mapper.merge(source, {}, mapping);
}
