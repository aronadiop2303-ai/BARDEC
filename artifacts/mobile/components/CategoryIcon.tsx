import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { Feather } from '@/components/Icon';
import { Category, DEFAULT_CATEGORY_ICON } from '@/constants/mockData';

interface Props {
  category: Category;
  size?: number;
  color: string;
}

/**
 * Renders a category's sponsored-brand logo when it has one, falling back
 * to its Feather icon while the image loads or if it fails — no category
 * ships a real `logo` today (no such asset pipeline exists yet), so this
 * currently always takes the icon path, but the swap is transparent once
 * one is added.
 */
export default function CategoryIcon({ category, size = 18, color }: Props) {
  const [logoFailed, setLogoFailed] = useState(false);
  const iconName = category.icon || DEFAULT_CATEGORY_ICON;

  if (category.logo && !logoFailed) {
    return (
      <View style={{ width: size, height: size }}>
        <Image
          source={{ uri: category.logo }}
          style={{ width: size, height: size, borderRadius: size / 4 }}
          resizeMode="contain"
          onError={() => setLogoFailed(true)}
        />
      </View>
    );
  }

  return <Feather name={iconName} size={size} color={color} />;
}
