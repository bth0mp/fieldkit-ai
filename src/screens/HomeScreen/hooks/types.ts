/**
 * Shared types for the HomeScreen hooks. They live here (not in useHomeScreen) so the sub-hook
 * (useLANDiscovery) can import them WITHOUT importing
 * useHomeScreen — which imports that sub-hook back, forming a cycle. useHomeScreen re-exports
 * these for existing external importers.
 */
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../../../navigation/types';

export type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'HomeTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;
