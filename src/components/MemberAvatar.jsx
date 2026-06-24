import { useState } from 'react'

const AV_COLORS = ['av-orange', 'av-teal', 'av-green', 'av-purple', 'av-amber']

function getInitials(name) {
  return (name || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

function getColor(name) {
  const code = (name || '?').charCodeAt(0)
  return AV_COLORS[code % AV_COLORS.length]
}

export default function MemberAvatar({ member, size = 34, fontSize, style: extraStyle }) {
  const [imgError, setImgError] = useState(false)

  if (!member) {
    return (
      <div
        className={`avatar av-orange`}
        style={{ width: size, height: size, fontSize: fontSize || Math.round(size * 0.38), ...extraStyle }}
      >
        ?
      </div>
    )
  }

  const showPhoto = member.photoUrl && !imgError

  if (showPhoto) {
    return (
      <img
        src={member.photoUrl}
        alt={member.name || ''}
        onError={() => setImgError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          ...extraStyle,
        }}
      />
    )
  }

  return (
    <div
      className={`avatar ${getColor(member.name)}`}
      style={{ width: size, height: size, fontSize: fontSize || Math.round(size * 0.38), ...extraStyle }}
    >
      {getInitials(member.name)}
    </div>
  )
}
