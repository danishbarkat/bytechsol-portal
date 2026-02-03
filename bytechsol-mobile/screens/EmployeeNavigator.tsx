import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Platform } from 'react-native';
import DashboardScreen from './employee/DashboardScreen';
import AttendanceScreen from './employee/AttendanceScreen';
import LeavesScreen from './employee/LeavesScreen';
import ProfileScreen from './employee/ProfileScreen';
import { CircleUser, LayoutDashboard, CalendarDays, Plane } from 'lucide-react-native';

const Tab = createBottomTabNavigator();

export default function EmployeeNavigator() {
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    height: Platform.OS === 'ios' ? 85 : 70,
                    paddingBottom: Platform.OS === 'ios' ? 25 : 15,
                    paddingTop: 10,
                    backgroundColor: '#ffffff',
                    borderTopWidth: 0,
                    elevation: 0,
                    shadowColor: '#2563eb',
                    shadowOffset: { width: 0, height: -5 },
                    shadowOpacity: 0.05,
                    shadowRadius: 10,
                },
                tabBarActiveTintColor: '#2563eb',
                tabBarInactiveTintColor: '#94a3b8',
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '900',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                }
            }}
        >
            <Tab.Screen
                name="Dashboard"
                component={DashboardScreen}
                options={{
                    tabBarLabel: 'Home',
                    tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} strokeWidth={2.5} />
                }}
            />
            <Tab.Screen
                name="Attendance"
                component={AttendanceScreen}
                options={{
                    tabBarLabel: 'History',
                    tabBarIcon: ({ color, size }) => <CalendarDays size={size} color={color} strokeWidth={2.5} />
                }}
            />
            <Tab.Screen
                name="Leaves"
                component={LeavesScreen}
                options={{
                    tabBarLabel: 'Leaves',
                    tabBarIcon: ({ color, size }) => <Plane size={size} color={color} strokeWidth={2.5} />
                }}
            />
            <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{
                    tabBarLabel: 'Profile',
                    tabBarIcon: ({ color, size }) => <CircleUser size={size} color={color} strokeWidth={2.5} />
                }}
            />
        </Tab.Navigator>
    );
}
