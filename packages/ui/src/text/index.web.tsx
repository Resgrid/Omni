import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { toDomProps } from '../utils/dom-props';
import { textStyle } from './styles';

type ITextProps = Omit<React.ComponentProps<'span'>, 'style'> &
  VariantProps<typeof textStyle> & {
    style?: StyleProp<TextStyle> | React.CSSProperties;
    testID?: string;
    /** Clamps to this many lines with a CSS line clamp (React Native `numberOfLines`). */
    numberOfLines?: number;
    ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityHint?: string;
  };

const Text = React.forwardRef<React.ElementRef<'span'>, ITextProps>(
  ({ className, isTruncated, bold, underline, strikeThrough, size = 'md', sub, italic, highlight, ...props }: { className?: string } & ITextProps, ref) => {
    return (
      <span
        className={textStyle({
          isTruncated,
          bold,
          underline,
          strikeThrough,
          size,
          sub,
          italic,
          highlight,
          class: className,
        })}
        {...(toDomProps(props) as React.ComponentProps<'span'>)}
        ref={ref}
      />
    );
  }
);

Text.displayName = 'Text';

export { Text };
