import { WEBSITE_NAME, WEBSITE_URL, WEBSITE_DESCRIPTION } from '../config/website'

export function copyWebsiteLink() {
  navigator.clipboard.writeText(WEBSITE_URL)
  return `${WEBSITE_NAME} website link copied.`
}

export function shareWebsite() {
  if (navigator.share) {
    navigator.share({
      title: WEBSITE_NAME,
      text: `Check out ${WEBSITE_NAME} — ${WEBSITE_DESCRIPTION}.`,
      url: WEBSITE_URL,
    })
  } else {
    copyWebsiteLink()
  }
}
