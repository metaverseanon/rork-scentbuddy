import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

interface ProfileAvatarProps {
  avatarUrl?: string | null;
  avatarEmoji?: string | null;
  size?: number;
  backgroundColor?: string;
}

export default function ProfileAvatar({ avatarUrl, avatarEmoji, size = 48, backgroundColor = '#e8e0d4' }: ProfileAvatarProps) {
  const borderRadius = size / 2;
  const emojiSize = size * 0.5;

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[
          styles.image,
          { width: size, height: size, borderRadius },
        ]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[styles.emojiContainer, { width: size, height: size, borderRadius, backgroundColor }]}>
      <Text style={{ fontSize: emojiSize }}>{avatarEmoji || '\uD83E\uDDF4'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#e0d8ce',
  },
  emojiContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
